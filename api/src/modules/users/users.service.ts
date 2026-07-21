import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthRole } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { maskUserIntegration } from '@/modules/integration-targets/utils/mask-credentials.util';
import { UserQueryType } from './dto/user-query.schema';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

export interface PaginatedUsersResult {
  data: Array<{
    id: string;
    email: string;
    phone: string | null;
    role: string;
    created_at: Date;
    updated_at: Date;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    delete user.password;

    return user;
  }

  async updateMe(id: string, dto: UpdateMeDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    if (dto.email && dto.email !== existing.email) {
      const emailTaken = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (emailTaken) {
        throw new ConflictException('User with this email already exists');
      }
    }

    const normalizedPhone =
      dto.phone === undefined
        ? undefined
        : dto.phone?.trim()
          ? dto.phone.trim()
          : null;

    if (normalizedPhone !== undefined && normalizedPhone !== existing.phone) {
      if (normalizedPhone) {
        const phoneTaken = await this.prisma.user.findUnique({
          where: { phone: normalizedPhone },
        });
        if (phoneTaken) {
          throw new ConflictException(
            'User with this phone number already exists',
          );
        }
      }
    }

    const data: { email?: string; phone?: string | null } = {};

    if (dto.email !== undefined) {
      data.email = dto.email;
    }

    if (normalizedPhone !== undefined) {
      data.phone = normalizedPhone;
    }

    if (Object.keys(data).length === 0) {
      return this.findById(id);
    }

    await this.prisma.user.update({
      where: { id },
      data,
    });

    return this.findById(id);
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      dto.current_password,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const password = await bcrypt.hash(dto.new_password, 10);

    await this.prisma.user.update({
      where: { id },
      data: { password },
    });

    return { message: 'Password changed successfully' };
  }

  async findAllAdmin(query: UserQueryType): Promise<PaginatedUsersResult> {
    const where = {
      ...(query.search && {
        OR: [
          { email: { contains: query.search, mode: 'insensitive' as const } },
          { phone: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
      ...(query.role && { role: query.role }),
    };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          created_at: true,
          updated_at: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        total_pages: Math.ceil(total / query.limit),
        has_next: query.page < Math.ceil(total / query.limit),
        has_prev: query.page > 1,
      },
    };
  }

  async findOneAdmin(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        created_at: true,
        updated_at: true,
        tracked_agencies: {
          include: {
            source_agency: {
              select: {
                id: true,
                name: true,
                base_url: true,
                is_visible: true,
                is_enabled: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
        },
        saved_properties: {
          select: {
            id: true,
            canonical_property_id: true,
            property_id: true,
            internal_id: true,
            title: true,
            city: true,
            price: true,
            currency: true,
            status: true,
            is_modified: true,
            last_synced_at: true,
            created_at: true,
            updated_at: true,
          },
          orderBy: { updated_at: 'desc' },
        },
        user_integrations: {
          include: {
            integration_target: {
              select: {
                id: true,
                integration_type: true,
                auth_type: true,
                base_url: true,
              },
            },
            settings: true,
          },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      ...user,
      user_integrations: user.user_integrations.map((integration) =>
        maskUserIntegration(integration),
      ),
    };
  }

  async updateAdmin(id: string, actorId: string, dto: UpdateAdminUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    if (
      id === actorId &&
      dto.role !== undefined &&
      dto.role !== existing.role
    ) {
      throw new ForbiddenException('You cannot change your own role');
    }

    if (dto.email && dto.email !== existing.email) {
      const emailTaken = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (emailTaken) {
        throw new ConflictException('User with this email already exists');
      }
    }

    const normalizedPhone =
      dto.phone === undefined
        ? undefined
        : dto.phone?.trim()
          ? dto.phone.trim()
          : null;

    if (normalizedPhone !== undefined && normalizedPhone !== existing.phone) {
      if (normalizedPhone) {
        const phoneTaken = await this.prisma.user.findUnique({
          where: { phone: normalizedPhone },
        });
        if (phoneTaken) {
          throw new ConflictException(
            'User with this phone number already exists',
          );
        }
      }
    }

    const data: {
      email?: string;
      phone?: string | null;
      role?: UpdateAdminUserDto['role'];
      password?: string;
    } = {};

    if (dto.email !== undefined) {
      data.email = dto.email;
    }

    if (normalizedPhone !== undefined) {
      data.phone = normalizedPhone;
    }

    if (dto.role !== undefined) {
      data.role = dto.role;
    }

    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }

    if (Object.keys(data).length === 0) {
      return this.findOneAdmin(id);
    }

    await this.prisma.user.update({
      where: { id },
      data,
    });

    return this.findOneAdmin(id);
  }

  async deleteAdmin(id: string, actorId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    if (id === actorId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    if (existing.role === AuthRole.SUPER_ADMIN) {
      throw new ForbiddenException('Super admin accounts cannot be deleted');
    }

    await this.prisma.user.delete({ where: { id } });

    return { message: 'User deleted' };
  }
}
