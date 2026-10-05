import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CreateWeatherDto } from './dto/create-weather.dto.js';

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly weatherUrl = 'https://api.open-meteo.com/v1/forecast';
  private readonly geoIpUrl = 'http://ip-api.com/json';

  constructor(private readonly httpService: HttpService) {}

  async getWeatherForecast(query: CreateWeatherDto, reqIp?: string) {
    let lat = query.latitude;
    let lon = query.longitude;
    let locationName = 'Localização do GPS';

    // Se latitude/longitude não vierem na Query, busca por IP
    if (!lat || !lon) {
      try {
        const clientIp = reqIp && reqIp !== '::1' && reqIp !== '127.0.0.1' ? reqIp : '';
        const geoResponse = await firstValueFrom(
          this.httpService.get(`${this.geoIpUrl}/${clientIp}`, { timeout: 3000 }),
        );

        if (geoResponse.data && geoResponse.data.status === 'success') {
          lat = geoResponse.data.lat;
          lon = geoResponse.data.lon;
          locationName = `${geoResponse.data.city}, ${geoResponse.data.regionName}`;
        } else {
          throw new Error('Falha na resposta do IP-API');
        }
      } catch (err) {
        this.logger.warn('GPS/IP indisponível. Usando coordenadas fallback.');
        lat = -14.86;
        lon = -40.84;
        locationName = 'Vitória da Conquista, BA (Padrão)';
      }
    }

    try {
      const { data } = await firstValueFrom(
        this.httpService.get(this.weatherUrl, {
          params: {
            latitude: lat,
            longitude: lon,
            timezone: query.timezone || 'auto',
            hourly: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m',
            current: 'temperature_2m,precipitation,wind_speed_10m',
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset',
            forecast_days: 7,
          },
          timeout: 5000,
        }),
      );

      return {
        detectedLocation: locationName,
        location: {
          latitude: data.latitude,
          longitude: data.longitude,
          elevation: data.elevation,
        },
        current: data.current,
        hourlyForecast: data.hourly,
        dailyForecast: data.daily,
      };
    } catch (error: any) {
      this.logger.error('Erro na chamada Open-Meteo:', error?.response?.data || error?.message);
      
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_GATEWAY,
          message: 'Erro ao conectar com o provedor meteorológico',
          details: error?.response?.data || error?.message,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}