# Deployment

For the current single-project Vercel Services deployment, follow [deployment-vercel-services.md](deployment-vercel-services.md).

The root `vercel.json` defines the `frontend`, `identity`, and `ballot` services and routes the existing API paths to the matching FastAPI app. Set the Vercel project root to the repository root and the Framework Preset to **Services**.

**Security note:** Vercel project environment variables should be treated as available to every service in the project. Because H.I.D.D.E.N. intentionally separates identity secrets and ballot storage, a single Vercel project does not preserve a strong secret-isolation boundary. Review the warning and alternatives in the Services deployment guide before using this architecture for real student feedback.
