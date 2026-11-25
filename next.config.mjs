/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'exceljs'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
