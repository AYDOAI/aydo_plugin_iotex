import {baseDriverModule} from '../core/base-driver-module';
import {inspect} from 'util';
import {W3bstreamClient} from "w3bstream-client-js";

class W3bstream extends baseDriverModule {

    get url() {
        return this.params.url;
    }

    get api_key() {
        return this.params.api_key;
    }

    get devices() {
        return this.params.devices ? this.params.devices : [];
    }

    initDeviceEx(resolve, reject) {
        super.initDeviceEx(() => {
            this.getDevices().then(devices => {
                const settings_ex = [];
                const items = [];
                settings_ex.push({key: 'devices', name: 'Devices', type: 'select', items, multi: true})
                devices.forEach(device => {
                    items.push({id: device.ident, title: device.name})
                });
                const status = {settings_ex};
                const statusEventName = this.eventTypeStatus(this.pluginTemplate.class_name, this.id);
                this.publishStatus(statusEventName, status);
            });
            resolve({});
        }, reject);
    }

    connectEx(resolve, reject) {
        if (this.mqtt) {
            this.app.log('connectEx already done');
            if (this.mqtt.connected) {
                return resolve({});
            } else {
                return reject({});
            }
        }
        this.device = new W3bstreamClient(this.url, this.api_key);

        this.require('mqtt').then((mqtt: any) => {
            this.mqtt = mqtt.connect(`mqtt://127.0.0.1`);
            this.mqtt.on('connect', () => {
                this.app.log('mqtt connected');

                this.mqtt.subscribe('aydo/#', (error: any) => {
                    if (error) {
                        this.app.errorEx(error);
                    }
                });

                this.mqtt.on('message', (topic: any, message: any) => {
                    message = message.toString();
                    this.app.log(topic, message);
                    const t = topic.split('/');
                    if (this.devices.find(item => item === t[1])) {
                        ['temperature'].forEach(ident => {
                            if (t[2].indexOf(ident) !== -1) {
                                const payload = {};
                                payload[ident] = ['temperature'].indexOf(ident) !== -1 ? parseFloat(message) : parseInt(message);
                                this.device.publishDirect({device_id: t[1]}, payload).then(res => {
                                    this.app.log(JSON.stringify(res.data, null, 2));
                                }).catch(e => {
                                    this.app.errorEx(e);
                                });
                            }
                        })
                    }
                });
                resolve({});
            });
        }).catch((error: any) => {
            reject(error);
        });
    }

    commandEx(command, value, params, options, resolve, reject, status) {
        resolve({});
    }

    getSubDevicesEx(resolve, reject, zones) {
        resolve([]);
    }
}

process.on('uncaughtException', (err) => {
    console.error(`${err ? err.message : inspect(err)}`);
});

const app = new W3bstream();
app.logging = true;

