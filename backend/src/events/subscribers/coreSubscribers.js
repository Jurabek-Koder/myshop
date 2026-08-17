import { eventBus, EVENT_BUS_ALL } from '../eventBus.js';

let registered = false;

export function registerCoreEventSubscribers() {
  if (registered) return;
  registered = true;

  eventBus.on(EVENT_BUS_ALL, (event) => {
    if (process.env.MYSHOP_EVENT_DEBUG === '1') {
      console.log(`[MyShop Event] ${event.event_type} :: ${event.module}`);
    }
  });
}

export default registerCoreEventSubscribers;
