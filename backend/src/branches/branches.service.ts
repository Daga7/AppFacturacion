import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const branches = await this.prisma.branch.findMany({
      orderBy: { name: 'asc' },
    });
    return JSON.parse(JSON.stringify(branches)) as typeof branches;
  }
}
