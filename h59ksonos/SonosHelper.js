'use strict';

class SonosHelper {
  // some function to be used in all nodes

  validateConfigNode (node, configNode) {
  /** Validate configNode - at least one of ipAddress or serial must exist (needed for player discovery)
  * @param  {Object} node current node
  * @param  {object} configNode corresponding configNode
  */

    if (configNode === undefined || configNode === null) {
      node.status({ fill: 'red', shape: 'ring', text: 'please select a config node' });
      return false;
    }

    var hasSerialNum = configNode.serialnum !== undefined && configNode.serialnum !== null && configNode.serialnum.trim().length > 5;
    var hasIpAddress = configNode.ipaddress !== undefined && configNode.ipaddress !== null && configNode.ipaddress.trim().length > 5;

    if (!hasSerialNum && !hasIpAddress) {
      this.setNodeStatus(node, 'error', 'missing serialNb, ip address', 'Missing serial number and IP Address in config node.');
      return false;
    } else {
      // clear node status
      node.status({});
      return true;
    }
  }

  preprocessInputMsg (node, configNode, msg, callback) {
    /** Validates ConfigNode and return sonos player object in callback
    * @param  {Object} node current node
    * @param  {object} configNode corresponding configNode
    * @return  returns the sonos player object in callback function
    */

    // valdate configNode - status is set in validateConfigNode
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
      this.setNodeStatus(node, 'warning', 'missing ip address', 'It is recommendet to set the ip Address in configuration node!');
      this.findSonos(node, configNode.serialnum, function (err, device) {
        if (err) {
          this.setNodeStatus(node, 'error', 'error finding sonos player', 'error finding sonos player with given serialnumber ' + configNode.serialnum);
          return;
        }
        if (device === null) {
          this.setNodeStatus(node, 'error', 'seach delivers no sonos player', 'sonos player with serial not found ' + configNode.serialnum);
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

      console.log('findsonos1');
    var search = sonos.DeviceDiscovery(function (device) {
      device.deviceDescription().then(data => {
        // Inject additional property
        if (data.friendlyName !== undefined && data.friendlyName !== null) {
          data.ipaddress = data.friendlyName.split('-')[0].trim();
        }
          console.log('findsonos2');
        if (device.host) {
          data.ipaddress = device.host;
        }

        // We use 2 different ways to obtain serialnum Sonos API
        if (data.serialNum !== undefined && data.serialNum !== null) {
          if (data.serialNum.trim().toUpperCase() === serialNumber.trim().toUpperCase()) {
            foundMatch = true;
          }
        }
          console.log('findsonos3');
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

  // TODO has to be removed
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
