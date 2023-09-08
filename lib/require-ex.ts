import {executeProcess} from './execute-process';
import * as fs from 'fs';

const semver = require('semver');

export class RequireEx {

  parent: any;
  queue: any;
  modules: any = {
    // 'curve25519-n2': {version: '^1.1.3', required: false},
    'decimal.js': {version: '^10.2.0', required: true},
    // 'ed25519': {version: '0.0.4', required: false},
    'fast-srp-hap': {version: '^1.0.1', required: true},
    'mdns': {version: '^2.5.1', required: true},
    'modbus-serial': {version: '^7.7.4', required: false},
    // 'openzwave-shared': {version: '^1.6.2', required: false},
    'sequelize': {version: '^4.42.0', required: true},
    'serialport': {version: '^9.0.0', required: false},
    'socket.io': {version: '^2.2.0', required: true},
    // 'sodium': {version: '^2.0.3', required: false},
    'sqlite3': {version: '^5.0.0', required: true},
    // 'zigbee-herdsman': {version: '0.13.26', required: false},
    'ws': {version: '^7.3.1', required: false},
    'generic-pool': {module: 'sequelize', required: false, uninstall: true},
    '../build/Release/sodium': {module: 'sodium', required: false, uninstall: true},
    '../build/Release/dns_sd_bindings': {module: 'mdns', required: false, uninstall: true},
  };

  // @ts-ignore
  constructor(parent) {
    const BetterQueue = require('./better-queue/queue');
    this.queue = new BetterQueue(this.onQueue.bind(this));
    this.parent = parent;
  }

  requireModule(ident: any, callback: any) {
    try {
      callback(null, `TRY: LoadModule(${ident})`, 'log');
      const module = eval(`require('${ident}')`);
      callback(null, `DONE: LoadModule(${ident})`, 'log');
      callback(null, module);
    } catch (e) {
      callback(e);
    }
  }

  onQueue(input: any, callback: any) {
    const callback1 = (error: any, data: any, name: any) => {
      // console.log(error, data, name);
      switch (name) {
        case 'log':
          if (this.parent && this.parent.app && this.parent.app.log) {
            this.parent.app.log(data);
          } else {
            console.log(data);
          }
          break;
        case 'require':
          if (data.module && typeof data.module === 'string') {
            this.requireModule(data.module, callback1);
          }
          break;
        case 'error':
          callback(error);
          break;
        default:
          if (error) {
            this.checkError(input, error, callback1);
          } else {
            callback(null, data);
          }
      }
    };

    let reinstall = false;
    callback1(null, `CheckModuleVersion(${input.module})`, 'log');
    const versionPath = `${process.cwd()}/package-lock.json`;
    if (fs.existsSync(versionPath)) {
      try {
        const versionContents = JSON.parse(fs.readFileSync(versionPath).toString());
        if (versionContents &&
          versionContents.dependencies &&
          versionContents.dependencies[input.module] &&
          versionContents.dependencies[input.module].version &&
          this.modules[input.module] &&
          this.modules[input.module].version) {
          callback1(null, `Installed: ${versionContents.dependencies[input.module].version}`, 'log');
          callback1(null, `Required: ${this.modules[input.module].version}`, 'log');
          if (!semver.satisfies(versionContents.dependencies[input.module].version, this.modules[input.module].version)) {
            callback1(null, `Satisfies: FALSE`, 'log');
            reinstall = true;
            this.install(input, input.module, callback1, 'uninstall');
          } else {
            callback1(null, `Satisfies: TRUE`, 'log');
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
    if (!reinstall) {
      if (input.error) {
        this.checkError(input, input.module, callback1);
      } else {
        this.requireModule(input.module, callback1);
      }
    }
  }

  install(input: any, module: any, callback: any, action = 'install') {
    callback(null, `TRY: ${action}Module(${module})`, 'log');
    // @ts-ignore
    executeProcess('npm', [action, module, '--unsafe-perm --save'], {cwd: process.cwd()}, true, 30 * 60000).then(() => {
      callback(null, `DONE: ${action}Module(${module})`, 'log');
      if (action === 'uninstall') {
        if (this.modules[module] && this.modules[module].version) {
          module += '@' + this.modules[module].version;
        }
        this.install(input, module, callback);
      } else {
        if (action === 'install') {
          process.exit();
        }
        callback(null, input, 'require');
      }
    }).catch((e: any) => {
      this.checkError(input, e, callback);
    });
  }

  checkError(input: any, error: any, callback: any) {
    callback(null, error, 'log');
    const version = (module: any) => {
      if (this.modules[module] && this.modules[module].version) {
        module += '@' + this.modules[module].version;
      }
      return module;
    }
    let module;
    let action = 'install';
    if (error) {
      if (error.code === 'MODULE_NOT_FOUND' || (error.message && error.message.indexOf('Could not locate the bindings file.') !== -1)) {
        module = error.message.substring(error.message.indexOf('\'') + 1);
        module = module.substring(0, module.indexOf('\''));
        if (this.modules[module] && this.modules[module].module) {
          input.module = this.modules[module].module;
          action = 'uninstall';
          module = input.module;
        } else if (input.module) {
          action = 'uninstall';
          module = input.module;
        } else {
          module = version(module);
        }
      } else if (typeof error === 'string') {
        const strings = [
          {
            startStr: 'Cannot find module \'',
            endStr: '\''
          }, {
            startStr: 'Refusing to delete ',
            endStr: ':',
            action: 'delete'
          }];
        strings.forEach(str => {
          const index = error.indexOf(str.startStr);
          if (index !== -1) {
            const index2 = error.indexOf(str.endStr, index + str.startStr.length);
            error = error.substring(index + str.startStr.length, index2);
            console.log(str.action, error);
            switch (str.action) {
              case 'delete':
                if (fs.existsSync(error)) {
                  fs.unlinkSync(error);
                  module = version(input.module);
                }
                break;
            }
          }
        })
      }
    }
    if (module) {
      this.install(input, module, callback, action);
    } else {
      callback(error, null, 'error');
    }
  }

  checkModule(module: any, error = false) {
    return new Promise((resolve, reject) => {
      this.queue.push({module, error}, (error: any, data: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }

  checkRequired(): Promise<any[]> {
    const promises: any[] = [];
    Object.keys(this.modules).forEach(key => {
      const module = this.modules[key];
      if (module.required !== false) {
        promises.push(this.checkModule(key));
      }
    });
    return Promise.all(promises);
  }

}