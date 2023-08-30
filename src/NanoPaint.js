// https://github.com/mrdoob/eventdispatcher.js/
class EventDispatcher {
  addEventListener(type, listener) {
    if (this._listeners === undefined) this._listeners = {};

    const listeners = this._listeners;

    if (listeners[type] === undefined) {
      listeners[type] = [];
    }

    if (listeners[type].indexOf(listener) === -1) {
      listeners[type].push(listener);
    }
  }

  hasEventListener(type, listener) {
    if (this._listeners === undefined) return false;

    const listeners = this._listeners;

    return (
      listeners[type] !== undefined && listeners[type].indexOf(listener) !== -1
    );
  }

  removeEventListener(type, listener) {
    if (this._listeners === undefined) return;

    const listeners = this._listeners;
    const listenerArray = listeners[type];

    if (listenerArray !== undefined) {
      const index = listenerArray.indexOf(listener);

      if (index !== -1) {
        listenerArray.splice(index, 1);
      }
    }
  }

  dispatchEvent(event) {
    if (this._listeners === undefined) return;

    const listeners = this._listeners;
    const listenerArray = listeners[event.type];

    if (listenerArray !== undefined) {
      event.target = this;

      // Make a copy, in case listeners are removed while iterating.
      const array = listenerArray.slice(0);

      for (let i = 0, l = array.length; i < l; i++) {
        array[i].call(this, event);
      }
    }
  }
}

{
  const eventDispatcherAddEventListener =
    EventDispatcher.prototype.addEventListener;
  EventDispatcher.prototype.addEventListener = function (
    type,
    listener,
    options
  ) {
    if (options) {
      if (options.once) {
        function onceCallback(event) {
          listener.apply(this, arguments);
          this.removeEventListener(type, onceCallback);
        }
        eventDispatcherAddEventListener.call(this, type, onceCallback);
      }
    } else {
      eventDispatcherAddEventListener.apply(this, arguments);
    }
  };
}

class Nanopaint extends EventDispatcher {
  enableLogging = true;
  log() {
    if (this.enableLogging) {
      console.groupCollapsed(`[${this.constructor.name}]`, ...arguments);
      console.trace(); // hidden in collapsed group
      console.groupEnd();
    }
  }

  services = {
    main: {
      uuid: "00000000-0001-11E1-9AB4-0002A5D5C51B".toLowerCase(),
      characteristics: {
        main: {
          uuid: "00E00000-0001-11E1-AC36-0002A5D5C51B".toLowerCase(),
        },
      },
    },
  };

  get isConnected() {
    return this.device && this.device.gatt.connected;
  }

  async connect() {
    this.log("attempting to connect...");
    if (this.isConnected) {
      this.log("already connected");
      return;
    }

    this.log("getting device...");
    this.device = await navigator.bluetooth.requestDevice({
      filters: [
        {
          services: [this.services.main.uuid],
        },
      ],
    });

    this.log("got device!");
    this.device.addEventListener(
      "gattserverdisconnected",
      this.onGattServerDisconnected.bind(this)
    );

    this.log("getting server");
    this.server = await this.device.gatt.connect();
    this.log("got server!");
    await this.onGattServerConnected();
  }
  async disconnect() {
    this.log("attempting to disconnect...");
    if (!this.isConnected) {
      this.log("already disconnected");
      return;
    }

    this.device.gatt.disconnect();
  }

  capitalize(string) {
    return string[0].toUpperCase() + string.slice(1);
  }

  async onGattServerConnected() {
    if (!this.isConnected) {
      return;
    }

    for (const serviceName in this.services) {
      const serviceInfo = this.services[serviceName];
      if (serviceInfo.ignore) {
        continue;
      }
      this.log(`getting "${serviceName}" service...`);
      const service = (serviceInfo.service =
        await this.server.getPrimaryService(serviceInfo.uuid));
      this.log(`got "${serviceName}" service!`, service);

      for (const characteristicName in serviceInfo.characteristics) {
        const characteristicInfo =
          serviceInfo.characteristics[characteristicName];
        this.log(`getting ${characteristicName} characteristic...`);
        const characteristic = (characteristicInfo.characteristic =
          await serviceInfo.service.getCharacteristic(characteristicInfo.uuid));
        this.log(`got ${characteristicName} characteristic!`, characteristic);

        if (characteristic.properties.notify) {
          characteristic.addEventListener(
            "characteristicvaluechanged",
            this[
              `on${this.capitalize(
                characteristicName
              )}CharacteristicValueChanged`
            ].bind(this)
          );
          this.log(`starting ${characteristicName} notifications...`);
          await characteristic.startNotifications();
          this.log(`started ${characteristicName} notifications!`);
        }
      }
    }

    this.log("connection complete!");
    this.dispatchEvent({ type: "connected" });
  }
  async onGattServerDisconnected() {
    this.log("disconnected");
    this.dispatchEvent({ type: "disconnected" });
  }

  resistValues = [
    100, 337.7, 510, 836.1, 1000, 3337, 5100, 8485, 10000, 35897, 56000, 82456,
    10000, 319729, 470000, 1000000,
  ];
  onMainCharacteristicValueChanged(event) {
    let dataView = event.target.value;
    //this.log("onMainCharacteristicValueChanged", event, dataView);
    const rawValues = new Uint16Array(dataView.buffer)
    console.log(dataView, rawValues)
    const values = [];
    rawValues.forEach((rawValue, index) => {
      const msb4 = (rawValue & 0xf000) >>> 12; // resistValues table index
      const lsb12 = rawValue & 0xfff; // Sensor Value
      const vOut = (lsb12 * 3.3) / 4095; // output voltage value
      const value = (this.resistValues[msb4] * (3.3 - vOut)) / vOut - 130; // sensor value in ohms
      values.push(value);
    });
    console.log(values)
  }

  async writeValue(value) {
    if (this.isConnected) {
      const valueArray = [];
      valueArray[0] = (value >> 8) & 0xff;
      valueArray[1] = value & 0xff;
      const byteArray = Uint8Array.from(valueArray);
      await this.services.main.characteristics.main.characteristic.writeValue(
        byteArray
      );
    }
  }
}
