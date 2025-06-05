import { z } from 'zod';

export const ConfigurationSchema = z.object({
  query_generator_model: z.string().default('gemini-2.0-flash'),
  reflection_model: z.string().default('gemini-2.5-flash-preview-04-17'),
  answer_model: z.string().default('gemini-2.5-pro-preview-05-06'),
  number_of_initial_queries: z.number().default(3),
  max_research_loops: z.number().default(2),
});

export type Configuration = z.infer<typeof ConfigurationSchema>;

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private config: Configuration;

  private constructor() {
    this.config = this.loadConfiguration();
  }

  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  private loadConfiguration(): Configuration {
    const rawConfig = {
      query_generator_model: process.env.QUERY_GENERATOR_MODEL,
      reflection_model: process.env.REFLECTION_MODEL,
      answer_model: process.env.ANSWER_MODEL,
      number_of_initial_queries: process.env.NUMBER_OF_INITIAL_QUERIES 
        ? parseInt(process.env.NUMBER_OF_INITIAL_QUERIES) 
        : undefined,
      max_research_loops: process.env.MAX_RESEARCH_LOOPS 
        ? parseInt(process.env.MAX_RESEARCH_LOOPS) 
        : undefined,
    };

    // Filter out undefined values
    const filteredConfig = Object.fromEntries(
      Object.entries(rawConfig).filter(([_, value]) => value !== undefined)
    );

    return ConfigurationSchema.parse(filteredConfig);
  }

  public getConfig(): Configuration {
    return this.config;
  }

  public updateConfig(updates: Partial<Configuration>): void {
    this.config = ConfigurationSchema.parse({ ...this.config, ...updates });
  }
}
