import { EventEmitter } from 'events';

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(100);

export const EVENT_BUS_ALL = '*';

export default eventBus;
