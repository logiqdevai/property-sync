import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import envConfig from '../src/shared/config/env';
import { GoogleTranslateModule } from '../src/integrations/google-translate/google-translate.module';
import { GoogleTranslateService } from '../src/integrations/google-translate/services/google-translate.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
    }),
    GoogleTranslateModule,
  ],
})
class GoogleTranslateSmokeModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(
    GoogleTranslateSmokeModule,
    { logger: ['error', 'warn', 'log'] },
  );

  try {
    const translate = app.get(GoogleTranslateService);

    if (!translate.isConfigured()) {
      throw new Error(
        'Google Translate not configured. Need GCS_PROJECT_ID + GCS credentials.',
      );
    }

    console.log('\n=== 1) translateText (en -> el) ===');
    const single = await translate.translateText({
      text: 'Bright apartment with sea view near the marina.',
      source: 'en',
      target: 'el',
    });
    console.log(JSON.stringify(single, null, 2));

    console.log('\n=== 2) translateMany (en -> el) ===');
    const many = await translate.translateMany({
      texts: [
        'Two bedrooms',
        'Fully furnished',
        'Available immediately',
      ],
      source: 'en',
      target: 'el',
    });
    console.log(JSON.stringify(many, null, 2));

    console.log('\n=== 3) detectLanguage ===');
    const detection = await translate.detectLanguage({
      text: 'Διαμέρισμα με θέα στη θάλασσα',
    });
    console.log(JSON.stringify(detection, null, 2));

    console.log('\n=== 4) getLanguages (sample) ===');
    const languages = await translate.getLanguages('en');
    console.log(
      JSON.stringify(
        {
          total: languages.length,
          sample: languages.filter((l) =>
            ['en', 'el', 'de', 'fr', 'es'].includes(l.code),
          ),
        },
        null,
        2,
      ),
    );

    console.log('\nGoogle Translate smoke test OK');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('\nGoogle Translate smoke test FAILED');
  console.error(error);
  process.exit(1);
});
