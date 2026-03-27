import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'OCR_SERVICE',
        transport: Transport.TCP,
        options: { host: 'localhost', port: 3901, retryAttempts: 5, retryDelay: 3000 },
      },
      {
        name: 'TTS_SERVICE',
        transport: Transport.TCP,
        options: { host: 'localhost', port: 3902, retryAttempts: 5, retryDelay: 3000 },
      },
      {
        name: 'DOCUMENT_SERVICE',
        transport: Transport.TCP,
        options: { host: 'localhost', port: 3903, retryAttempts: 5, retryDelay: 3000 },
      },
      {
        name: 'VOCABULARY_SERVICE',
        transport: Transport.TCP,
        options: { host: 'localhost', port: 3904, retryAttempts: 5, retryDelay: 3000 },
      },
      {
        name: 'AGENTIC_SERVICE',
        transport: Transport.TCP,
        options: { host: 'localhost', port: 3905, retryAttempts: 5, retryDelay: 3000 },
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class GatewayClientsModule {}
