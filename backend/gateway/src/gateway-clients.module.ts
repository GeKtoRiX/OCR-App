import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

const TCP_RETRY_ATTEMPTS = Number(process.env.TCP_RETRY_ATTEMPTS ?? 5);
const TCP_RETRY_DELAY = Number(process.env.TCP_RETRY_DELAY ?? 3000);

function tcpClient(name: string, portEnv: string, defaultPort: number) {
  return {
    name,
    transport: Transport.TCP as const,
    options: {
      host: 'localhost',
      port: Number(process.env[portEnv] ?? defaultPort),
      retryAttempts: TCP_RETRY_ATTEMPTS,
      retryDelay: TCP_RETRY_DELAY,
    },
  };
}

@Module({
  imports: [
    ClientsModule.register([
      tcpClient('OCR_SERVICE', 'OCR_SERVICE_PORT', 3901),
      tcpClient('TTS_SERVICE', 'TTS_SERVICE_PORT', 3902),
      tcpClient('DOCUMENT_SERVICE', 'DOCUMENT_SERVICE_PORT', 3903),
      tcpClient('VOCABULARY_SERVICE', 'VOCABULARY_SERVICE_PORT', 3904),
      tcpClient('AGENTIC_SERVICE', 'AGENTIC_SERVICE_PORT', 3905),
    ]),
  ],
  exports: [ClientsModule],
})
export class GatewayClientsModule {}
