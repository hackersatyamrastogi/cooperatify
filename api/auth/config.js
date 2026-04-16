// GET /api/auth/config — which sign-in providers are enabled
export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.status(200).json({
    providers: {
      github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      dev: process.env.COOP_DEV_LOGIN === '1',
    },
  });
}
