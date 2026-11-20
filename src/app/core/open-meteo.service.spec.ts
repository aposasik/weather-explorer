import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { OpenMeteoService, TIMELINE_HOURS, toPlaceForecast } from './open-meteo.service';
import { describeWeather } from './weather-codes';

function hourly(startIso: string) {
  const start = Date.parse(startIso + 'Z');
  const time = Array.from({ length: TIMELINE_HOURS }, (_, hourIndex) => new Date(start + hourIndex * 3_600_000).toISOString().slice(0, 16));
  const sameEveryHour = (value: number) => Array(TIMELINE_HOURS).fill(value);
  return {
    time,
    temperature_2m: sameEveryHour(20),
    precipitation: sameEveryHour(0),
    weather_code: sameEveryHour(1),
    wind_speed_10m: sameEveryHour(10),
    wind_direction_10m: sameEveryHour(90),
    is_day: sameEveryHour(1),
  };
}

describe('OpenMeteoService', () => {
  let weatherApi: OpenMeteoService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    weatherApi = TestBed.inject(OpenMeteoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks for many points in ONE request, then serves them from the cache', async () => {
    const thisHour = new Date().toISOString().slice(0, 13) + ':00';
    const points = [
      { lat: 10, lon: 20, key: 'a' },
      { lat: 30, lon: 40, key: 'b' },
    ];

    const first = firstValueFrom(weatherApi.getMapTimelines(points));
    const request = http.expectOne((sent) => sent.url.includes('/v1/forecast'));
    expect(request.request.params.get('latitude')).toBe('10,30');
    expect(request.request.params.get('longitude')).toBe('20,40');
    request.flush([{ hourly: hourly(thisHour) }, { hourly: hourly(thisHour) }]);
    expect((await first).size).toBe(2);

    const second = await firstValueFrom(weatherApi.getMapTimelines(points));
    expect(second.size).toBe(2);
    http.expectNone(() => true);
    expect(weatherApi.requestsSent()).toBe(1);
  });

  it('does not call the geocoding API for searches under 3 letters', async () => {
    expect(await firstValueFrom(weatherApi.searchPlaces('a'))).toEqual([]);
    expect(await firstValueFrom(weatherApi.searchPlaces('ab'))).toEqual([]);
    http.expectNone(() => true);
  });
});

describe('describeWeather', () => {
  it('maps WMO codes and shows a moon at night', () => {
    expect(describeWeather(0).label).toBe('Clear sky');
    expect(describeWeather(0, false).icon).toBe('🌙');
    expect(describeWeather(999).label).toBe('Unknown');
  });
});

describe('toPlaceForecast', () => {
  it('keeps sunrise and sunset from the daily data', () => {
    const forecast = toPlaceForecast({ timezone: 'Europe/Athens', daily: { sunrise: ['2026-11-20T07:20'], sunset: ['2026-11-20T17:07'] } });
    expect(forecast.daily.sunrise[0].slice(11, 16)).toBe('07:20');
    expect(forecast.daily.sunset[0].slice(11, 16)).toBe('17:07');
  });
});
