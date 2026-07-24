import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Astro 5+ 內容入口：src/content.config.ts

const specificationSchema = z.object({
  label: z.string(),
  value: z.string(),
});

const portfolio = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/portfolio' }),
  schema: ({ image }) =>
    z.object({
      id: z.string(),
      title: z.string(),
      subtitle: z.string(),
      year: z.string(),
      category: z.string(),
      tag: z.string(),
      heroImage: image(),
      detailImages: z.array(image()).default([]),
      specifications: z.array(specificationSchema).default([]),
    }),
});

const profile = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/profile' }),
  schema: z.object({
    title: z.string().optional(),
    facts: z.array(z.string()).optional(),
    memes: z
      .array(
        z.object({
          label: z.string(),
          shape: z.enum(['circle', 'rect', 'tri']).default('rect'),
        }),
      )
      .optional(),
  }),
});

const futurePlanShape = z.enum([
  'hex',
  'circle',
  'tri',
  'rect',
  'diamond',
  'iso',
  'ring',
  'cross',
]);

const futurePlans = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/future-plans' }),
  schema: z.object({
    drawing: z.string().default('BINGLE-FUTURE'),
    revision: z.string().default('A'),
    scale: z.string().default('1:1'),
    title: z.string(),
    subtitle: z.string().optional(),
    plans: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        desc: z.string(),
        year: z.string(),
        code: z.string().default(''),
        status: z.enum(['research', 'build', 'exhibit', 'explore']).default('explore'),
        shape: futurePlanShape.default('rect'),
      }),
    ),
  }),
});

export const collections = {
  portfolio,
  profile,
  futurePlans,
};
