import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'API root health ping' })
  @ApiResponse({ status: 200, description: 'Hello message', type: String })
  getHello(): string {
    return this.appService.getHello();
  }
}
