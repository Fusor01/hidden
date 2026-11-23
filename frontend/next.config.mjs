const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Native / stateful server packages must not be bundled into a serverless function.
    serverComponentsExternalPackages: ["pg", "@node-rs/argon2"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
    ] }];
  },
};
export default nextConfig;
