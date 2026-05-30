import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  // dockerode (agent provisioner) pulls in native modules (ssh2/cpu-features) that
  // bundlers can't inline. We only use the local Docker socket / TCP, never SSH,
  // so keep these as runtime externals on the server instead of bundling them.
  serverExternalPackages: ['dockerode', 'docker-modem', 'ssh2', 'cpu-features'],
}

export default nextConfig
