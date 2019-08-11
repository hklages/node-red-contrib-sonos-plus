'use strict';

class SonosHelper {
  // some function to be used in all nodes

  validateConfigNode (node, configNode) {
    // PURPOSE Check existing of configNode and ipaddress, serialnumber are stored.
    // HINT No validation whether ip address belongs to a SONOS player

    if (configNode === undefined || configNode === null) {
      node.status({ fill: 'red', shape: 'ring', text: 'please select a config node' });
      return false;
    }

    var hasSerialNum = configNode.serialnum !== undefined && configNode.serialnum !== null && configNode.serialnum.trim().length > 5;
    var hasIpAddress = configNode.ipaddress !== undefined && configNode.ipaddress !== null && configNode.ipaddress.trim().length > 5;
    if (!hasSerialNum && !hasIpAddress) {
      node.status({ fill: 'red', shape: 'ring', text: 'missing serial number or IP Address in config node' });
      return false;
    }
    // clear node status
    node.status({});
    return true;
  }

  preprocessInputMsg (node, configNode, msg, callback) {
    // TODO handle that in calling function - maybe obsolete as already checked before
    var isValid = this.validateConfigNode(node, configNode);
    if (!isValid) {
      return;
    }

    // use IP Address if user set it
    var hasIpAddress = configNode.ipaddress !== undefined && configNode.ipaddress !== null && configNode.ipaddress.trim().length > 5;
    if (hasIpAddress) {
      // prefered case
      if (callback) {
        callback(configNode);
      }
    } else {
      // first find the Sonos IP address from given serial number
      console.log('Please enter the ip address in config node - see documentation');

      this.findSonos(node, configNode.serialnum, function (err, device) {
        if (err) {
          node.status({ fill: 'red', shape: 'dot', text: 'error looking for device ' + configNode.serialnum });
          return;
        }
        if (device === null) {
          node.status({ fill: 'red', shape: 'dot', text: 'device ' + configNode.serialnum + ' not found' });
          return;
        }
        if (callback) {
          callback(device);
        }
      });
    }
  }

  findSonos (node, serialNumber, callback) {
    var foundMatch = false;
    const sonos = require('sonos');

    var search = sonos.DeviceDiscovery(function (device) {
      device.deviceDescription().then(data => {
        // Inject additional property
        if (data.friendlyName !== undefined && data.friendlyName !== null) {
          data.ipaddress = data.friendlyName.split('-')[0].trim();
        }

        if (device.host) {
          data.ipaddress = device.host;
        }

        // We use 2 different ways to obtain serialnum Sonos API
        if (data.serialNum !== undefined && data.serialNum !== null) {
          if (data.serialNum.trim().toUpperCase() === serialNumber.trim().toUpperCase()) {
            foundMatch = true;
          }
        }
        if (device.serialNumber !== undefined && device.serialNumber !== null) {
          if (device.serialNumber.trim().toUpperCase() === serialNumber.trim().toUpperCase()) {
            foundMatch = true;
          }
        }
        if (foundMatch && callback) {
          callback(null, data);
        }

        if (foundMatch) {
          if (search !== null && search !== undefined) {
            search.destroy();
          }
          search = null;
        }
      }).catch({
        if (err) {
          node.error(JSON.stringify(err));
          callback(err, null);
        }
      });
    });
    search.setMaxListeners(Infinity);

    // In case there is no match
    setTimeout(function () {
      if (!foundMatch && callback) {
        callback(null, null);
      }
      if (search !== null && search !== undefined) {
        search.destroy();
        search = null;
      }
    }, 3000);
  }

  handleSonosApiRequest (node, err, result, msg, successString, failureString) {
    if (err) {
      node.error(err);
      console.log(err);
      if (!failureString) {
        failureString = 'failed to execute request';
      }
      node.status({ fill: 'red', shape: 'dot', text: failureString });
      return;
    }

    msg.payload = result;

    if (!successString) {
      successString = 'request success';
    }
    node.status({ fill: 'blue', shape: 'dot', text: successString });
  }
}
module.exports = SonosHelper;
