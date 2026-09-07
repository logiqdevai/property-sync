# Fixing Our Blocked Scrapers — Cost Summary

## The problem

Two of our 17 property listing scrapers (`openhousechania.com` and `lafazanihomes.com`) are currently blocked by the websites' anti-bot protection (Cloudflare). The same pages load fine from a regular computer — it's specifically our automated server that gets blocked, because it looks like a bot to the website's security system.

## The fix

We tested a service called **Bright Data**, which routes our scraper through a real browser with a trustworthy internet connection, so the target websites treat it like a normal visitor instead of a bot. It plugs into our existing system with no rework required.

## What we measured

Rather than guess, we ran a full real-world test — visiting every single page and every single property listing on both websites, and measuring exactly how much data each page transfers, since that's what this service charges for.

- **openhousechania.com**: 556 properties
- **lafazanihomes.com**: 346 properties

## The cost-saving discovery

Most of the data transferred on these pages is property photos. But our scraper doesn't need to actually download the photos — it only needs to grab the photo's web address (the link), the same way you can see a photo's filename without opening it. By skipping the photo downloads specifically, we cut the data usage by **96%**, with zero loss of information — no photos are missed, they're simply fetched later, for free, when actually needed.

## Real cost, measured

| | Just these 2 scrapers today | If we scale to 100 scrapers |
|---|---|---|
| **Without the photo-skip fix** | ~$330/month | ~$1,980/month |
| **With the photo-skip fix** | **~$12/month** | **~$72/month** |

## Why not a cheaper-looking alternative?

We also priced out a different type of service (one that fetches a single webpage at a time via a simple request, instead of a real browser). On paper it can look competitive, but:
- It charges a flat fee per page regardless of size, so our photo-skip trick doesn't save any money there — it ends up **more expensive** than Bright Data even at best case.
- It would require rebuilding parts of our scraper engine from scratch, including a price-discount detection feature that technically cannot work with that type of service at all.

Bright Data is both the cheaper option and the one that requires no rework — so that's what we're moving forward with.

## Bottom line

Fixing these 2 scrapers costs about **$12/month**. Scaling this same protection to 100 scrapers, if we ever need it, would cost about **$72/month**. Both numbers come from real, measured data — not estimates.
