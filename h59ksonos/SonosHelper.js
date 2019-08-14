'use strict';

class SonosHelper {
  // some function to be used in all nodes

  validateConfigNodeV2 (configNode) {
  /** Validate configNode: exist and at least one of ipAddress or serial must exist (needed for player discovery)
  * @param  {Object} node current node
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
      // clear node status
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
      node.status({});
    }
    // result at this point: either IP address or serial exists.

    // use IP Address if user set it
    var hasIpAddress = configNode.ipaddress !== undefined && configNode.ipaddress !== null && configNode.ipaddress.trim().length > 5;
    if (hasIpAddress) {
      // exisiting ip address - fastes solutions, no discovery necessary
      if (typeof callback === 'function') {
        callback(configNode.ipaddress);
      }
    } else {
      // get ip address from serialnumber: start discovery returns ipaddress or null
      this.setNodeStatus(node, 'Warning', 'Missing ip address', 'It is recommended to set the IP address in configuration node!');
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
          // caution dont use "this." - eg for helper calls  - as context is not available
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
    const sonos = require('sonos');
    // 2 api calls chained, first DeviceDiscovery then deviceDescription
    var search = sonos.DeviceDiscovery(function (device) {
      device.deviceDescription().then(data => {
        if (data.friendlyName !== undefined && data.friendlyName !== null) {
          data.ipaddress = data.friendlyName.split('-')[0].trim();
        }
        if (device.host) {
          data.ipaddress = device.host;
        }

        // 2 different ways to obtain serialnum
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
          // something went wrong
          callback(err, null);
        }
      });
    });
    search.setMaxListeners(Infinity);

    // In case there is no match
    setTimeout(function () {
      if (!foundMatch && (typeof callback === 'function')) {
        callback(null, null);
      }
      if (search !== null && search !== undefined) {
        search.destroy();
        search = null;
      }
    }, 5000);
  }

  setNodeStatus (node, type, nodeText, msgDetails) {
    /**  Provide message back to NodeRED - status of node and Error/Warning
    * @param  {Object} node current node
    * @param  {string} type error|warning|other
    * @param  {string} nodeText short description
    * @param  {Object} msgDetails more information
    */
    if (type === 'error') {
      node.status({ fill: 'red', shape: 'dot', text: nodeText });
      node.error('Error:: ' + nodeText + ' Details: ' + JSON.stringify(msgDetails));
    } else if (type === 'warning') {
      node.status({ fill: 'blue', shape: 'dot', text: nodeText });
      node.warn('Warning:: ' + nodeText + ' Details: ' + JSON.stringify(msgDetails));
    } else if (type === 'success') {
      node.status({ fill: 'green', shape: 'dot', text: 'OK:: ' + nodeText });
    }
  }
}
module.exports = SonosHelper;
