import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface LiveKitTokenRequest {
  room_name: string;
  participant_identity: string;
  participant_name: string;
  participant_metadata?: string;
  participant_attributes?: Record<string, string>;
}

export interface LiveKitTokenResponse {
  server_url: string;
  participant_token: string;
}

@Service()
export class Videocallapi {
  private readonly http = inject(HttpClient);

  private readonly apiUrl = 'https://sloped-mom-unhidden.ngrok-free.dev';

  async getToken(payload: LiveKitTokenRequest): Promise<LiveKitTokenResponse> {
    return await firstValueFrom(
      this.http.post<LiveKitTokenResponse>(`${this.apiUrl}/getToken`, payload),
    );
  }
}
