/**
 * Solve one captcha through 2captcha and print the result as a single JSON line.
 *
 * Used by the `mcp-crawl` skill: when the visible MCP Chrome hits a captcha, the
 * session reads the sitekey from the page, runs this, and injects the returned
 * token back into the page. Does NOT bootstrap Nest (starts in ~1s), only needs
 * CAPTCHA_API_KEY in the environment:
 *
 *   cd api
 *   npx dotenv -e .env.staging -- node -r ts-node/register scripts/solve-captcha.ts --balance
 *   npx dotenv -e .env.staging -- node -r ts-node/register scripts/solve-captcha.ts \
 *     --type=turnstile --url=<page-url> --sitekey=<key> [--action= --data= --pagedata=]
 *   ... --type=recaptcha2 --url= --sitekey= [--invisible] [--user-agent=] [--cookies=]
 *   ... --type=hcaptcha --url= --sitekey=      (also Imperva's "Pardon Our Interruption")
 *   ... --type=recaptcha3--url= --sitekey= [--min-score=0.7] [--page-action=]
 *   ... --type=image --image-file=<path.png> [--numeric=1] [--case] [--math]
 *   ... --report=<taskId>:correct|incorrect
 *
 * Output: {"ok":true,"token":"...","userAgent":"...","taskId":123,"cost":"0.00299"}
 *     or  {"ok":false,"code":"ERROR_ZERO_BALANCE","error":"..."}  (exit code 1)
 * Solving takes ~10-60s; run it with a generous timeout.
 */
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { CaptchaConfig } from '../src/integrations/captcha/config/captcha.config';
import { CaptchaException } from '../src/integrations/captcha/exceptions/captcha.exception';
import { CaptchaClientService } from '../src/integrations/captcha/services/captcha-client.service';
import { CaptchaSolverService } from '../src/integrations/captcha/services/captcha-solver.service';

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args.set(m[1], m[2] ?? 'true');
}
const need = (name: string): string => {
  const v = args.get(name);
  if (!v) throw new Error(`Missing --${name}`);
  return v;
};

async function main() {
  const config = new CaptchaConfig(
    new ConfigService({ CAPTCHA_API_KEY: process.env.CAPTCHA_API_KEY }),
  );
  const solver = new CaptchaSolverService(
    new CaptchaClientService(config),
    config,
  );

  if (args.has('balance')) {
    return { ok: true, balance: await solver.getBalance() };
  }

  const report = args.get('report');
  if (report) {
    const [id, verdict] = report.split(':');
    if (verdict === 'correct') await solver.reportCorrect(Number(id));
    else await solver.reportIncorrect(Number(id));
    return { ok: true };
  }

  const type = need('type');
  let solution;
  switch (type) {
    case 'turnstile':
      solution = await solver.solveTurnstile({
        websiteURL: need('url'),
        websiteKey: need('sitekey'),
        action: args.get('action'),
        data: args.get('data'),
        pagedata: args.get('pagedata'),
      });
      break;
    case 'recaptcha2':
      solution = await solver.solveRecaptchaV2({
        websiteURL: need('url'),
        websiteKey: need('sitekey'),
        isInvisible: args.has('invisible') || undefined,
        userAgent: args.get('user-agent'),
        cookies: args.get('cookies'),
      });
      break;
    case 'hcaptcha':
      solution = await solver.solveHCaptcha({
        websiteURL: need('url'),
        websiteKey: need('sitekey'),
      });
      break;
    case 'recaptcha3':
      solution = await solver.solveRecaptchaV3({
        websiteURL: need('url'),
        websiteKey: need('sitekey'),
        minScore: args.has('min-score') ? Number(args.get('min-score')) : undefined,
        pageAction: args.get('page-action'),
      });
      break;
    case 'image':
      solution = await solver.solveImage({
        body: readFileSync(need('image-file')).toString('base64'),
        numeric: args.has('numeric')
          ? (Number(args.get('numeric')) as 0 | 1 | 2 | 3 | 4)
          : undefined,
        case: args.has('case') || undefined,
        math: args.has('math') || undefined,
      });
      break;
    default:
      throw new Error(
        `Unknown --type=${type} (turnstile|recaptcha2|recaptcha3|hcaptcha|image)`,
      );
  }
  return { ok: true, ...solution };
}

main()
  .then((out) => console.log(JSON.stringify(out)))
  .catch((e) => {
    const code = e instanceof CaptchaException ? e.code : undefined;
    console.log(
      JSON.stringify({
        ok: false,
        code,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    process.exit(1);
  });
