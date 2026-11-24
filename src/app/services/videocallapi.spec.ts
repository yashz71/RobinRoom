import { TestBed } from '@angular/core/testing';
import { Videocallapi } from './videocallapi';

describe('Videocallapi', () => {
  let service: Videocallapi;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Videocallapi);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
