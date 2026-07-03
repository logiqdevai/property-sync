# Real Estate Property Aggregation Platform

## Functional Project Specification

# 1. Project Overview

The platform is a centralized property aggregation system that automatically collects real estate listings from multiple public real estate agency websites and synchronizes them with a customer's CMS.

The system is designed to support hundreds of independent property sources, with the ability to continuously add new websites over time without changing the core platform.

The application focuses on:

* Property discovery
* Automatic updates
* Property removal detection
* Duplicate property entry detection
* Centralized management
* Scraper monitoring
* Manual and scheduled execution
* High visibility into scraper health

---

# 2. Main Objectives

The system shall:

* Collect properties from many agency websites.
* Normalize property information into a common structure.
* Detect new listings.
* Detect listing updates.
* Detect removed listings.
* Detect duplicate entries
* Keep historical crawl information.
* Synchronize data with the customer's CMS.
* Provide complete monitoring of every scraper.
* Allow new scrapers to be added independently.

---

# 3. User Authentication

Users can:

* Register
* Login

---

# 4. Dashboard

The dashboard should display:

* Total Scrapers
* Total agencies
* Active agencies
* Running Scrapers
* Failed Scrapers
* Last Crawl Time
* Properties Imported Today
* Updated Properties Today
* Removed Properties Today
* Failed Properties
* Total Properties
* Queue Status
* Running Jobs
* Failed Jobs
* CMS Synchronization Status

Recent activity should include:

* Latest crawls
* Failed crawls
* New listings
* Removed listings
* Broken scrapers

---

# 5. Source Agencies

Each source agency contains:

* Name
* Website URL
* Country
* City
* Status
* Crawl Type
* Pagination Type
* Crawl Interval
* Proxy Required
* Robots Information
* Notes

Admin Users can:

* View agencies
* Search agencies
* Enable
* Disable
* Archive
* View crawl history
* View scraper history

Users can:

* View their agencies
* Enable / Disable
* View added listings
* View removed listings

     

---

# 6. Scraper Management

Each agency has its own scraper.

Each scraper has:

* Version
* Status
* Last Success
* Last Failure
* Average Runtime
* Success Rate
* Current Health
* Configuration
* Validation Rules

Supported scraper states:

* Testing
* Active
* Disabled
* Deprecated
* Broken

---

# 7. Manual Scraping

Every scraper must support manual execution.

From the interface the user can:

Run Scraper Now

This immediately creates a crawl job.

Manual execution should work regardless of the configured schedule.

---

# 8. Scheduled Scraping

Every scraper has its own schedule.

Examples:

* Every hour
* Every 6 hours
* Every day
* Every week

Each scraper runs independently.

The scheduler automatically creates queue jobs.

---

# 9. Crawl Process

Each crawl performs:

Discover properties

↓

Collect property URLs

↓

Visit property pages

↓

Extract data

↓

Normalize

↓

Compare with existing data

↓

Create

Update

Remove

↓

Synchronize CMS

↓

Generate reports

---

# 10. Property Discovery

The crawler should discover:

New properties

Existing properties

Updated properties

Removed properties

Unavailable pages

Redirected pages

Duplicate listings

---

# 11. Property Removal Detection

The platform must detect when a property has been removed from a source website.

Removal may occur because:

* Listing deleted
* Listing sold
* Listing rented
* URL removed
* 404 page
* Listing hidden

The system should compare every crawl with previous crawls.

If a previously discovered listing no longer exists:

Status becomes:

Removed

The removal event is stored.

The property is marked for CMS removal.

History remains available.

The user can see:

* Removal date
* Source website
* Previous data
* Removal reason if detectable

---

# 12. Property Updates

When a property changes:

* Price
* Description
* Images
* Bedrooms
* Bathrooms
* Surface
* Address
* Features

The system detects differences.

Only changed data is synchronized.

History should be preserved.

---

# 13. Duplicate Detection

Duplicate properties should be detected using:

* External ID
* Source URL
* Address
* Coordinates
* Images
* Similar title
* Similar description
* Price
* Area

Duplicates should be grouped together.

---

# 14. Property History

Every property keeps history.

History includes:

Created

Updated

Price Changes

Images Added

Images Removed

Status Changes

Removal

Reappearance

---

# 15. CMS Synchronization

The system synchronizes:

New Properties

Updated Properties

Removed Properties

Synchronization must support retries.

Failures should never lose data.

---

# 16. Crawl History

Every crawl stores:

Start Time

Finish Time

Duration

Properties Found

Properties Created

Properties Updated

Properties Removed

Errors

Warnings

Average Processing Time

Memory Usage

CPU Usage

Worker

---

# 17. Job Queue Monitoring

BullMQ jobs should be monitored.

Display:

Waiting

Running

Completed

Failed

Retries

Attempts

Duration

Worker

Queue

Payload

Result

Stack Trace

Error Message

---

# 18. Scraper Health Monitoring

Every scraper should continuously calculate its health.

Metrics include:

Success Rate

Failure Rate

Average Runtime

Average Properties Found

Last Successful Crawl

Last Failed Crawl

Consecutive Failures

Queue Failures

Extraction Errors

Timeouts

CMS Failures

Health score should be displayed as:

Excellent

Good

Warning

Critical

Broken

---

# 19. Broken Scraper Detection

The system should automatically identify broken scrapers.

Examples:

No properties found

Selectors no longer work

Website layout changed

Website unavailable

Repeated failures

Authentication failure

Timeouts

Blocked by website

HTTP errors

When a scraper is considered broken:

Mark scraper as Broken

Generate notification

Show on dashboard

Suspend scheduled execution (optional)

Allow manual execution for testing

---

# 20. Notifications

Notifications should exist for:

Broken scraper

CMS synchronization failure

Property removal spike

Large crawl failure

Queue failures

Website unavailable


---



# 23. Logs

Every action should be logged.

Examples:

Manual crawl

Scheduled crawl

CMS synchronization

Property removed

Property updated

Scraper failure

Job failure

Retry

---


# 25. Future Expansion

The architecture should support:

Unlimited agencies

Unlimited scrapers

Multiple CMS integrations

AI-assisted scraper generation

Automatic selector validation

Automatic layout change detection

Webhook integrations

REST API

Multiple workers

Distributed crawling

---

# 26. Success Criteria

The platform should allow an administrator to:

* Add a new agency.
* Attach a dedicated scraper.
* Execute it manually.
* Schedule automatic crawls.
* Detect new listings.
* Detect updated listings.
* Detect removed listings.
* Automatically synchronize changes to the CMS.
* Monitor every crawl.
* Monitor every BullMQ job.
* Detect broken scrapers.
* Review crawl history.
* Review property history.
* Scale to hundreds of agency websites without modifying the core application.
