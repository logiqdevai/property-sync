import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { AgencyStatus } from 'generated/prisma';
import { CreateAgencyDto } from './dto/create-agency.dto';
import { UpdateAgencyDto } from './dto/update-agency.dto';
import { UpdateAgencyVisibilityDto } from './dto/update-agency-visibility.dto';
import { AgencyQueryType } from './dto/agency-query.schema';
import { PaginatedResult } from './interfaces/agency.interface';

@Injectable()
export class AgenciesService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(query: AgencyQueryType): Promise<PaginatedResult<any>> {
        const where = {
            ...(query.search && {
                OR: [
                    { name: { contains: query.search, mode: 'insensitive' as const } },
                    { base_url: { contains: query.search, mode: 'insensitive' as const } },
                ],
            }),
            ...(query.status && { status: query.status }),
            ...(query.country && { country: query.country }),
            ...(query.city && { city: query.city }),
            ...(query.is_visible !== undefined && { is_visible: query.is_visible }),
            ...(query.is_enabled !== undefined && { is_enabled: query.is_enabled }),
        };

        const [items, total] = await Promise.all([
            this.prisma.sourceAgency.findMany({
                where,
                skip: (query.page - 1) * query.limit,
                take: query.limit,
                orderBy: { created_at: 'desc' },
            }),
            this.prisma.sourceAgency.count({ where }),
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

    async findOne(id: string) {
        const agency = await this.prisma.sourceAgency.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { scrapers: true, crawl_runs: true, notifications: true },
                },
            },
        });

        if (!agency) {
            throw new NotFoundException('Agency not found');
        }

        return agency;
    }

    async create(dto: CreateAgencyDto) {
        const existing = await this.prisma.sourceAgency.findUnique({
            where: { base_url: dto.base_url },
        });

        if (existing) {
            throw new ConflictException('An agency with this base_url already exists');
        }

        return this.prisma.sourceAgency.create({ data: dto });
    }

    async update(id: string, dto: UpdateAgencyDto) {
        await this.ensureExists(id);

        return this.prisma.sourceAgency.update({
            where: { id },
            data: dto,
        });
    }

    // Any AgencyStatus transition is allowed for now. Revisit once the product
    // spec defines legal transitions (e.g. blocking ARCHIVED -> DISABLED).
    async updateStatus(id: string, status: AgencyStatus) {
        await this.ensureExists(id);

        return this.prisma.sourceAgency.update({
            where: { id },
            data: { status },
        });
    }

    async updateVisibility(id: string, dto: UpdateAgencyVisibilityDto) {
        await this.ensureExists(id);

        return this.prisma.sourceAgency.update({
            where: { id },
            data: dto,
        });
    }

    async remove(id: string) {
        await this.ensureExists(id);

        const [scraperCount, crawlRunCount] = await Promise.all([
            this.prisma.scraper.count({ where: { source_agency_id: id } }),
            this.prisma.crawlRun.count({ where: { source_agency_id: id } }),
        ]);

        if (scraperCount > 0 || crawlRunCount > 0) {
            throw new ConflictException('Agency has scrapers or crawl runs — archive it instead of deleting');
        }

        await this.prisma.sourceAgency.delete({ where: { id } });
    }

    async updateTrackerCrawlInterval(agencyId: string, userId: string, crawl_interval: string) {
        const tracker = await this.prisma.userTrackedAgency.findUnique({
            where: { user_id_source_agency_id: { user_id: userId, source_agency_id: agencyId } },
        });

        if (!tracker) {
            throw new NotFoundException('This user does not track this agency');
        }

        return this.prisma.userTrackedAgency.update({
            where: { id: tracker.id },
            data: { crawl_interval },
        });
    }

    private async ensureExists(id: string) {
        const agency = await this.prisma.sourceAgency.findUnique({ where: { id } });

        if (!agency) {
            throw new NotFoundException('Agency not found');
        }

        return agency;
    }
}
