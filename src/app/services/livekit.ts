import { Service, signal } from '@angular/core';
import type { LocalAudioTrack, LocalVideoTrack, Room } from 'livekit-client';

type LiveKitSdk = typeof import('livekit-client');

@Service()
export class Livekit {
  // Room
  private room?: Room;
  private sdkPromise?: Promise<LiveKitSdk>;

  // Local tracks acquired before joining a room
  private localVideoTrack?: LocalVideoTrack;
  private localAudioTrack?: LocalAudioTrack;

  // Preview stream
  private previewStream?: MediaStream;

  // State
  readonly cameraEnabled = signal(false);
  readonly microphoneEnabled = signal(false);
  readonly connected = signal(false);
  readonly connecting = signal(false);

  readonly cameraError = signal<string | null>(null);
  readonly microphoneError = signal<string | null>(null);
  readonly connectionError = signal<string | null>(null);

  readonly cameraDevices = signal<MediaDeviceInfo[]>([]);
  readonly microphoneDevices = signal<MediaDeviceInfo[]>([]);
  readonly cameraFacing = signal<'front' | 'back' | null>(null);
  readonly switchingCamera = signal(false);
  readonly cameraSwitchError = signal<string | null>(null);
  private remoteAudioElements: HTMLAudioElement[] = [];

  // =========================================================
  // DEVICE INITIALIZATION
  // =========================================================

  private loadSdk(): Promise<LiveKitSdk> {
    this.sdkPromise ??= import('livekit-client');
    return this.sdkPromise;
  }

  private setupRoomEvents(
    roomEvents: LiveKitSdk['RoomEvent'],
    trackSdk: LiveKitSdk['Track'],
  ): void {
    if (!this.room) return;

    this.room.on(roomEvents.TrackSubscribed, (track, publication, participant) => {
      console.log('Remote track subscribed:', {
        identity: participant.identity,
        kind: track.kind,
      });

      if (track.kind === trackSdk.Kind.Audio) {
        const audioElement = track.attach() as HTMLAudioElement;

        audioElement.autoplay = true;
        audioElement.controls = false;
        audioElement.muted = false;
        audioElement.volume = 1;

        document.body.appendChild(audioElement);
        this.remoteAudioElements.push(audioElement);

        audioElement.play().catch((error) => {
          console.error('Failed to play Robin audio:', error);
        });
      }
    });

    this.room.on(roomEvents.TrackUnsubscribed, (track) => {
      track.detach().forEach((element) => element.remove());
    });
  }

  async requestMediaAccess(): Promise<void> {
    this.cameraError.set(null);
    this.microphoneError.set(null);

    try {
      const { createLocalTracks, Track } = await this.loadSdk();
      const tracks = await createLocalTracks({
        audio: true,
        video: true,
      });

      for (const track of tracks) {
        if (track.kind === Track.Kind.Video) {
          this.localVideoTrack = track as LocalVideoTrack;
        }

        if (track.kind === Track.Kind.Audio) {
          this.localAudioTrack = track as LocalAudioTrack;
        }
      }

      this.cameraEnabled.set(!!this.localVideoTrack);
      this.microphoneEnabled.set(!!this.localAudioTrack);

      this.updatePreview();
      await this.refreshDevices();
      await this.updateCameraFacing();
    } catch (error) {
      console.error('Media access error:', error);

      this.cameraError.set('Unable to access camera. Check permissions and device availability.');

      this.microphoneError.set(
        'Unable to access microphone. Check permissions and device availability.',
      );

      throw error;
    }
  }

  // =========================================================
  // LOCAL CAMERA PREVIEW
  // =========================================================

  private updatePreview(): void {
    if (!this.localVideoTrack) {
      this.previewStream = undefined;
      return;
    }

    this.previewStream = new MediaStream([this.localVideoTrack.mediaStreamTrack]);
  }

  getPreviewStream(): MediaStream | undefined {
    return this.previewStream;
  }

  // =========================================================
  // CAMERA
  // =========================================================

  async toggleCamera(): Promise<void> {
    if (!this.localVideoTrack) return;

    const enabled = !this.cameraEnabled();

    this.localVideoTrack.mediaStreamTrack.enabled = enabled;
    this.cameraEnabled.set(enabled);
  }

  async switchCamera(): Promise<void> {
    if (!this.localVideoTrack || this.switchingCamera()) return;

    const devices = this.cameraDevices();
    if (devices.length < 2) {
      this.cameraSwitchError.set('A second camera was not found on this device.');
      return;
    }

    this.switchingCamera.set(true);
    this.cameraSwitchError.set(null);

    try {
      const currentDeviceId = await this.localVideoTrack.getDeviceId();
      const nextFacing = this.cameraFacing() === 'back' ? 'front' : 'back';
      const facingLabel = nextFacing === 'front' ? /front|user|facetime/ : /back|rear|environment/;
      const nextDevice =
        devices.find(
          (device) =>
            device.deviceId !== currentDeviceId && facingLabel.test(device.label.toLowerCase()),
        ) ?? devices.find((device) => device.deviceId !== currentDeviceId);

      if (!nextDevice || !(await this.localVideoTrack.setDeviceId(nextDevice.deviceId))) {
        throw new Error('The camera could not be switched.');
      }

      const label = nextDevice.label.toLowerCase();
      const inferredFacing = /back|rear|environment/.test(label)
        ? 'back'
        : /front|user|facetime/.test(label)
          ? 'front'
          : null;
      this.cameraFacing.set(inferredFacing ?? nextFacing);
      this.updatePreview();
    } catch (error) {
      console.error('Camera switch error:', error);
      this.cameraSwitchError.set('Could not switch cameras. Please try again.');
    } finally {
      this.switchingCamera.set(false);
    }
  }

  private async updateCameraFacing(): Promise<void> {
    const deviceId = await this.localVideoTrack?.getDeviceId();
    const label = this.cameraDevices()
      .find((device) => device.deviceId === deviceId)
      ?.label.toLowerCase();
    this.cameraFacing.set(label ? (/back|rear|environment/.test(label) ? 'back' : 'front') : null);
  }

  // =========================================================
  // MICROPHONE
  // =========================================================

  async toggleMicrophone(): Promise<void> {
    if (!this.localAudioTrack) return;

    const enabled = !this.microphoneEnabled();

    this.localAudioTrack.mediaStreamTrack.enabled = enabled;
    this.microphoneEnabled.set(enabled);
  }

  // =========================================================
  // DEVICE ENUMERATION
  // =========================================================

  async refreshDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      this.cameraDevices.set(devices.filter((device) => device.kind === 'videoinput'));

      this.microphoneDevices.set(devices.filter((device) => device.kind === 'audioinput'));
    } catch (error) {
      console.error('Device enumeration error:', error);
    }
  }

  // =========================================================
  // LIVEKIT CONNECTION
  // =========================================================

  async connect(serverUrl: string, token: string): Promise<void> {
    if (this.connected()) return;

    this.connectionError.set(null);
    this.connecting.set(true);

    try {
      const { RoomEvent, Track, Room: LiveKitRoom } = await this.loadSdk();
      this.room = new LiveKitRoom({
        adaptiveStream: true,
        dynacast: true,
      });

      this.setupRoomEvents(RoomEvent, Track);

      this.room.on(RoomEvent.Connected, () => {
        this.connected.set(true);
        this.connecting.set(false);
      });

      this.room.on(RoomEvent.Disconnected, () => {
        this.connected.set(false);
        this.connecting.set(false);
      });

      await this.room.connect(serverUrl, token);

      // Publish existing tracks acquired during the pre-call screen.
      if (this.localVideoTrack) {
        await this.room.localParticipant.publishTrack(this.localVideoTrack, {
          source: Track.Source.Camera,
        });
      }

      if (this.localAudioTrack) {
        await this.room.localParticipant.publishTrack(this.localAudioTrack, {
          source: Track.Source.Microphone,
        });
      }
    } catch (error) {
      console.error('LiveKit connection error:', error);
      console.log('error in service: ', error);

      this.connectionError.set('Unable to connect to the LiveKit room.');
      this.connecting.set(false);

      throw error;
    }
  }

  // =========================================================
  // REMOTE PARTICIPANTS
  // =========================================================

  getRoom(): Room | undefined {
    return this.room;
  }

  // =========================================================
  // DISCONNECT
  // =========================================================
  async disconnect(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
      this.room = undefined;
    }

    this.remoteAudioElements.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });

    this.remoteAudioElements = [];

    this.connected.set(false);
    this.connecting.set(false);
  }

  // =========================================================
  // MEDIA CLEANUP
  // =========================================================

  cleanupMedia(): void {
    this.localVideoTrack?.stop();
    this.localAudioTrack?.stop();

    this.localVideoTrack = undefined;
    this.localAudioTrack = undefined;
    this.previewStream = undefined;

    this.cameraEnabled.set(false);
    this.microphoneEnabled.set(false);
  }

  // =========================================================
  // FULL CLEANUP
  // =========================================================

  async cleanup(): Promise<void> {
    await this.disconnect();
    this.cleanupMedia();
  }
}
