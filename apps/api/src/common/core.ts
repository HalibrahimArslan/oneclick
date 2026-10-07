import { Global, Inject, Module } from '@nestjs/common';
import { createContainer, type Container } from '../core/container';

export const CONTAINER = Symbol('CONTAINER');
export const InjectContainer = () => Inject(CONTAINER);

@Global()
@Module({
  providers: [{ provide: CONTAINER, useFactory: (): Container => createContainer() }],
  exports: [CONTAINER],
})
export class CoreModule {}
