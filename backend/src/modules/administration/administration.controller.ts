import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdministrationService } from './administration.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateEstateDto } from './dto/create-estate.dto';
import { UpdateEstateDto } from './dto/update-estate.dto';
import { CreateBuildingDto } from './dto/create-building.dto';
import { CreateApartmentDto } from './dto/create-apartment.dto';
import { CreateResidentDto } from './dto/create-resident.dto';
import { CreateSecurityOfficerDto } from './dto/create-security-officer.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';
import { UpdateApartmentDto } from './dto/update-apartment.dto';
import { UpdateResidentDto } from './dto/update-resident.dto';
import { UpdateSecurityOfficerDto } from './dto/update-security-officer.dto';
import { ConfirmPasswordDto } from './dto/confirm-password.dto';

// Every list/create endpoint below accepts an optional ?estateId= query
// param. For ESTATE_ADMIN it's ignored in favor of their own estate
// (see AdministrationService.resolveEstateId) — it only matters for
// SUPER_ADMIN, who has no default estate of their own.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdministrationController {
  constructor(private readonly adminService: AdministrationService) {}

  @Roles('SUPER_ADMIN')
  @Post('estates')
  createEstate(@Body() dto: CreateEstateDto) {
    return this.adminService.createEstate(dto);
  }

  @Roles('SUPER_ADMIN')
  @Get('estates')
  listEstates() {
    return this.adminService.listEstates();
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Post('buildings')
  createBuilding(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Body() dto: CreateBuildingDto,
  ) {
    return this.adminService.createBuilding(user, estateId, dto);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Get('buildings')
  listBuildings(@CurrentUser() user: AuthenticatedUser, @Query('estateId') estateId?: string) {
    return this.adminService.listBuildings(user, estateId);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Patch('buildings/:id')
  updateBuilding(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateBuildingDto,
  ) {
    return this.adminService.updateBuilding(user, estateId, id, dto);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Delete('buildings/:id')
  removeBuilding(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Param('id') id: string,
    @Body() dto: ConfirmPasswordDto,
  ) {
    return this.adminService.removeBuilding(user, estateId, id, dto);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Post('apartments')
  createApartment(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Body() dto: CreateApartmentDto,
  ) {
    return this.adminService.createApartment(user, estateId, dto);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Get('apartments')
  listApartments(@CurrentUser() user: AuthenticatedUser, @Query('estateId') estateId?: string) {
    return this.adminService.listApartments(user, estateId);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Patch('apartments/:id')
  updateApartment(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateApartmentDto,
  ) {
    return this.adminService.updateApartment(user, estateId, id, dto);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Post('residents')
  createResident(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Body() dto: CreateResidentDto,
  ) {
    return this.adminService.createResident(user, estateId, dto);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Get('residents')
  listResidents(@CurrentUser() user: AuthenticatedUser, @Query('estateId') estateId?: string) {
    return this.adminService.listResidents(user, estateId);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Patch('residents/:id/status')
  updateResidentStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.adminService.updateResidentStatus(user, estateId, id, dto);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Patch('residents/:id')
  updateResident(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateResidentDto,
  ) {
    return this.adminService.updateResident(user, estateId, id, dto);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Delete('residents/:id')
  removeResident(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Param('id') id: string,
    @Body() dto: ConfirmPasswordDto,
  ) {
    return this.adminService.removeResident(user, estateId, id, dto);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Post('security-officers')
  createSecurityOfficer(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Body() dto: CreateSecurityOfficerDto,
  ) {
    return this.adminService.createSecurityOfficer(user, estateId, dto);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Get('security-officers')
  listSecurityOfficers(@CurrentUser() user: AuthenticatedUser, @Query('estateId') estateId?: string) {
    return this.adminService.listSecurityOfficers(user, estateId);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Patch('security-officers/:id/status')
  updateSecurityOfficerStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.adminService.updateSecurityOfficerStatus(user, estateId, id, dto);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Patch('security-officers/:id')
  updateSecurityOfficer(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateSecurityOfficerDto,
  ) {
    return this.adminService.updateSecurityOfficer(user, estateId, id, dto);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Delete('security-officers/:id')
  removeSecurityOfficer(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Param('id') id: string,
    @Body() dto: ConfirmPasswordDto,
  ) {
    return this.adminService.removeSecurityOfficer(user, estateId, id, dto);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedUser, @Query('estateId') estateId?: string) {
    return this.adminService.getOverview(user, estateId);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Get('estate')
  getEstateSettings(@CurrentUser() user: AuthenticatedUser, @Query('estateId') estateId?: string) {
    return this.adminService.getEstateSettings(user, estateId);
  }

  @Roles('ESTATE_ADMIN', 'SUPER_ADMIN')
  @Patch('estate')
  updateEstate(
    @CurrentUser() user: AuthenticatedUser,
    @Query('estateId') estateId: string | undefined,
    @Body() dto: UpdateEstateDto,
  ) {
    return this.adminService.updateEstate(user, estateId, dto);
  }
}
