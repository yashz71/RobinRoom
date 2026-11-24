import { Component, ElementRef, OnDestroy, signal, inject, viewChild } from '@angular/core';

import { Livekit } from './services/livekit';
import { Videocallapi } from './services/videocallapi';

@Component({
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnDestroy {
  readonly preview = viewChild<ElementRef<HTMLVideoElement>>('preview');

  readonly mediaReady = signal(false);
  readonly loadingMedia = signal(false);
  readonly error = signal<string | null>(null);

  readonly livekit = inject(Livekit);
  private videoCallApi = inject(Videocallapi);
  readonly roomName = signal('robin-video-room');

  // Temporary identity until authentication is integrated
  readonly participantIdentity = signal(`user-${crypto.randomUUID()}`);

  readonly participantName = signal('User');

  async initializeMedia(): Promise<void> {
    this.loadingMedia.set(true);
    this.error.set(null);
    this.livekit.cameraSwitchError.set(null);

    try {
      await this.livekit.requestMediaAccess();

      const stream = this.livekit.getPreviewStream();

      const previewElement = this.preview()?.nativeElement;
      if (stream && previewElement) {
        previewElement.srcObject = stream;
      }

      this.mediaReady.set(true);
    } catch (error) {
      console.error(error);
      this.error.set('Could not access camera or microphone.');
    } finally {
      this.loadingMedia.set(false);
    }
  }

  async toggleCamera(): Promise<void> {
    await this.livekit.toggleCamera();
  }

  async toggleMicrophone(): Promise<void> {
    await this.livekit.toggleMicrophone();
  }

  async switchCamera(): Promise<void> {
    await this.livekit.switchCamera();

    const previewElement = this.preview()?.nativeElement;
    const stream = this.livekit.getPreviewStream();
    if (stream && previewElement) {
      previewElement.srcObject = stream;
    }
  }

  async joinRoom(): Promise<void> {
    if (!this.mediaReady() || this.livekit.connecting()) {
      return;
    }

    this.error.set(null);

    try {
      // 1. Request participant token from Express
      const tokenResponse = await this.videoCallApi.getToken({
        room_name: this.roomName(),
        participant_identity: this.participantIdentity(),
        participant_name: this.participantName(),
      });

      // 2. Connect to LiveKit using the returned token
      await this.livekit.connect(tokenResponse.server_url, tokenResponse.participant_token);
    } catch (error) {
      console.error('Join room error:', error);
      this.error.set('Failed to join the LiveKit room.');
    }
  }

  async leaveRoom(): Promise<void> {
    await this.livekit.disconnect();
  }

  ngOnDestroy(): void {
    void this.livekit.cleanup();
  }
}
