import { ContentLanguage } from 'generated/prisma';
import { EstateWebLanguageId } from '@/integrations/estateweb/constants/estateweb-enums.constants';

export const CONTENT_LANGUAGE_TO_ESTATEWEB_ID: Record<
  ContentLanguage,
  EstateWebLanguageId
> = {
  EL: 1,
  EN: 2,
  DE: 3,
  FR: 4,
  IT: 5,
  RU: 6,
};

export const ESTATEWEB_ID_TO_CONTENT_LANGUAGE: Record<
  EstateWebLanguageId,
  ContentLanguage
> = {
  1: ContentLanguage.EL,
  2: ContentLanguage.EN,
  3: ContentLanguage.DE,
  4: ContentLanguage.FR,
  5: ContentLanguage.IT,
  6: ContentLanguage.RU,
};

export const CONTENT_LANGUAGE_TO_GOOGLE_CODE: Record<ContentLanguage, string> =
  {
    EL: 'el',
    EN: 'en',
    DE: 'de',
    FR: 'fr',
    IT: 'it',
    RU: 'ru',
  };

export const CONTENT_LANGUAGES = Object.values(ContentLanguage);
