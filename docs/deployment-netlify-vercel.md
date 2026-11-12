# Legacy split-host deployment

This document describes the previous Netlify + two-Vercel-project layout. It is retained only as a migration reference and is not the current deployment configuration.

For the current one-project Vercel Services setup, see [deployment-vercel-services.md](deployment-vercel-services.md).

The previous layout used separate Vercel projects for identity and ballot specifically to keep their environment variables and database credentials isolated. That isolation is a security property, not merely a deployment detail. A single Vercel Services project shares project-level environment variables; do not migrate production secrets into one project without explicitly accepting that trade-off.
