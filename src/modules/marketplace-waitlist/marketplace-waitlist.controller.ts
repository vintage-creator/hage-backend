import { Body, Controller, Post, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { MarketplaceWaitlistService } from './marketplace-waitlist.service';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';

@ApiTags('marketplace-waitlist')
@Controller('marketplace-waitlist')
export class MarketplaceWaitlistController {
  constructor(private readonly service: MarketplaceWaitlistService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a marketplace waitlist entry' })
  @ApiResponse({ status: 201, description: 'Entry submitted successfully' })
  @ApiBody({ type: CreateWaitlistDto })
  async create(@Body() dto: CreateWaitlistDto) {
    return this.service.register(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Fetch all marketplace waitlist entries' })
  @ApiResponse({ status: 200, description: 'List of waitlist entries' })
  async findAll() {
    return this.service.getAll();
  }
}
