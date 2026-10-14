import 'dotenv/config';

export const isProduction = process.env.NODE_ENV === 'production' || process.env.COZE_PROJECT_ENV === 'PROD';
