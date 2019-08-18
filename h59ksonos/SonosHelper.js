'use strict';

class SonosHelper {
  // functions to be used in other modules

  validateConfigNodeV2 (configNode) {
  /** Validate configNode: exist and at least one of ipAddress or serial must exist (needed for player discovery)
  * @param  {object} configNode corresponding configNode
  */

    if (configNode === undefined || configNode === null) {
      return false;
    }

    var hasSerialNum = configNode.serialnum !== undefined && configNode.serialnum !== null && configNode.serialnum.trim().length > 5;
    var hasIpAddress = configNode.ipaddress !== undefined && configNode.ipaddress !== null && configNode.ipaddress.trim().length > 5;
    if (!hasSerialNum && !hasIpAddress) {
      return false;
    } else {
      return true;
    }
  }

  identifyPlayerProcessInputMsg (node, configNode, msg, callback) {
    /** Validates ConfigNode and return sonos player object in callback
    * @param  {Object} node current node to set status and send error
    * @param  {Object} configNode corresponding configNode
    * @param  {Object} msg received message
    * @param  {function} callback callback function with paramenter ipaddress - can be null
    */

    // valdate configNode
    var isValid = this.validateConfigNodeV2(configNode);
    if (!isValid) {
      node.error('Error:: Invalid config node.');
      node.status({ fill: 'red', shape: 'dot', text: 'Invalid config node.' });
      if (typeof callback === 'function') {
        // error - return null as ipadrress
        callback(null);
      }
      return;
    } else {
      node.log('SONOS-PLUS::Info::' + 'ConfigNode object does exist with ip address or serial number.');
      node.status({});
    }
    // result at this point: either IP address or serial exists.

    // use IP Address if user set it
    var hasIpAddress = configNode.ipaddress !== undefined && configNode.ipaddress !== null && configNode.ipaddress.trim().length > 5;
    if (hasIpAddress) {
      // exisiting ip address - fastes solutions, no discovery necessary
      node.log('SONOS_PLUS::Info::' + 'Found IP Address - good!');
      if (typeof callback === 'function') {
        callback(configNode.ipaddress);
      }
    } else {
      // get ip address from serialnumber: start discovery returns ipaddress or null
      node.status({ fill: 'green', shape: 'dot', text: 'missing ip address' });
      node.log('SONOS-PLUS::Warning::' + 'Missing IP address. It is recommended to set IP Address in config node');

      this.findSonos(node, configNode.serialnum, function (err, playerInfo) {
        if (err) {
          // caution dont use "this." - eg for handler calls - as context is not available
          node.error('Error:: Discovery went wrong. Details: ' + JSON.stringify(err));
          node.status({ fill: 'red', shape: 'dot', text: 'Discoery did not work.' });
          if (typeof callback === 'function') {
            callback(null);
          }
          return;
        }
        if (playerInfo === null || playerInfo.ipaddress === null) {
          node.error('Error:: Time out: Could not find sonos player with given serial ' + configNode.serialnum);
          node.status({ fill: 'red', shape: 'dot', text: 'Could not find player.' });
          if (typeof callback === 'function') {
            callback(null);
          }
        } else {
          if (typeof callback === 'function') {
            // setting of nodestatus is dann in following call handelIpuntMessage
            callback(playerInfo.ipaddress);
          }
        }
      });
    }
  }

  findSonos (node, serialNumber, callback) {
    /** Starts async discovery of sonos player and selecte the one with given serial
    * @param  {Object} node current node
    * @param  {string} serialNumber player serial number
    * @param  {function} callback function with parameter err, data from type object
    * data.ipaddress provides ip-address
    */
    // TODO in callback only return ipaddress and not data

    var foundMatch = false;
    node.log('SONOS_PLUS::Info::' + 'Start find Sonos player.');
    const sonos = require('sonos');
    // 2 api calls chained, first DeviceDiscovery then deviceDescription
    var search = sonos.DeviceDiscovery(function (device) {
      device.deviceDescription().then(data => {
        if (data.friendlyName !== undefined && data.friendlyName !== null) {
          node.log('SONOS_PLUS::Info::' + 'Got ipaddres from friendyName.');
          data.ipaddress = data.friendlyName.split('-')[0].trim();
        }
        if (device.host) {
          node.log('SONOS_PLUS::Info::' + 'Got ipaddres from device.host.');
          data.ipaddress = device.host;
        }

        // 2 different ways to obtain serialnum
        if (data.serialNum !== undefined && data.serialNum !== null) {
          if (data.serialNum.trim().toUpperCase() === serialNumber.trim().toUpperCase()) {
            node.log('SONOS_PLUS::Info::' + 'Found sonos player based on serialnumber in device description.');
            foundMatch = true;
          }
        }
        if (device.serialNumber !== undefined && device.serialNumber !== null) {
          if (device.serialNumber.trim().toUpperCase() === serialNumber.trim().toUpperCase()) {
            node.log('SONOS_PLUS::Info::' + 'Found sonos player based on serialnumber in device property.');
            foundMatch = true;
          }
        }

        // found matching device: call back and stop search
        if (foundMatch && (typeof callback === 'function')) {
          // return "no error" and data object
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
          // error handling in call back
          callback(err, null);
        }
      });
    });
    search.setMaxListeners(Infinity);

    // In case there is no match
    setTimeout(function () {
      if (!foundMatch && (typeof callback === 'function')) {
        node.log('SONOS_PLUS::Info::' + 'SetTimeOut - did not find sonos player');
        callback(null, null);
      }
      if (search !== null && search !== undefined) {
        node.log('SONOS_PLUS::Info::' + 'Sonos player found - clean up object');
        search.destroy();
        search = null;
      }
    }, 5000);
  }
}
module.exports = SonosHelper;
