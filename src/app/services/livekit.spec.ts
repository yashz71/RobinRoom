import { TestBed } from '@angular/core/testing';
import { Livekit } from './livekit';

describe('Livekit', () => {
  let service: Livekit;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Livekit);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
