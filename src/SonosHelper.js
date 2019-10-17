'use strict';

module.exports = class SonosHelper {
  // functions to be used in other modules

  /** Validate configNode.
  * @param  {object} configNode corresponding configNode
  * @return {Boolean} true if: not null, not undefined, either ipaddress or serial exists
  *                   and ipaddress has correct syntax
  */
  validateConfigNodeV3 (configNode) {
    if (configNode === undefined || configNode === null) {
      return false;
    }

    const hasSerialNum = (configNode.serialnum !== undefined &&
                        configNode.serialnum !== null &&
                        configNode.serialnum.trim().length > 5);
    const hasIpAddress = (configNode.ipaddress !== undefined &&
                        configNode.ipaddress !== null);

    const IPREGEX = /^(?:(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])(\.(?!$)|$)){4}$/;
    if (hasIpAddress) {
      if ((configNode.ipaddress.trim()).match(IPREGEX)) {
        // prefered case: valid ip address
        return true;
      } else {
        if (hasSerialNum) {
          return true;
        } else {
          return false;
        }
      }
    } else {
      if (hasSerialNum) {
        // no ip but serial
        return true;
      } else {
        // no ip and no serial
        return false;
      }
    }
  }

  /** Returns sonos player object in callback.
  * @param  {Object} node current node to set status and send error
  * @param  {Object} configNode corresponding configNode
  * @param  {Object} msg received message
  * @param  {function} callback callback function with paramenter ipaddress - can be null
  * prereq: expecting that configNode has been validated for this input message
  */
  identifyPlayerProcessInputMsg (node, configNode, msg, callback) {
    // use IP Address if user set it
    const hasIpAddress = configNode.ipaddress !== undefined && configNode.ipaddress !== null && configNode.ipaddress.trim().length > 5;
    if (hasIpAddress) {
      // exisiting ip address - fastes solutions, no discovery necessary
      node.debug('Found IP address');
      if (typeof callback === 'function') {
        callback(configNode.ipaddress);
      }
    } else {
      // get ip address from serialnumber: start discovery returns ipaddress or null
      node.status({ fill: 'green', shape: 'dot', text: 'error:check ip address - missing ip address' });
      node.warn('Only a Warning: Missing IP address. Details: It is recommended to set IP Address in config node');

      this.findSonos(node, configNode.serialnum, function (err, playerInfo) {
        if (err) {
          node.status({ fill: 'red', shape: 'dot', text: 'error:findSonos - Discoery went wrong' });
          node.error('findSonos - Discoery went wrong Details: ' + JSON.stringify(err));
          if (typeof callback === 'function') {
            callback(null);
          }
          return;
        }
        if (playerInfo === null || playerInfo.ipaddress === null) {
          node.status({ fill: 'red', shape: 'dot', text: 'error:findSonos - Could not find player' });
          node.error('findSonos - Could not find player with given serial Details: time out:' + configNode.serialnum);
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

  /** Starts async discovery of sonos player and selecte the one with given serial.
  * @param  {Object} node current node
  * @param  {string} serialNumber player serial number
  * @param  {function} callback function with parameter err, data from type object
  * data.ipaddress provides ip-address
  */
  // TODO in callback only return ipaddress and not data
  findSonos (node, serialNumber, callback) {
    let foundMatch = false;
    node.debug('Start find Sonos player.');
    const sonos = require('sonos');
    // 2 api calls chained, first DeviceDiscovery then deviceDescription
    let search = sonos.DeviceDiscovery(function (device) {
      device.deviceDescription()
        .then(data => {
          if (data.friendlyName !== undefined && data.friendlyName !== null) {
            node.debug('Got ipaddres from friendlyName.');
            data.ipaddress = data.friendlyName.split('-')[0].trim();
          }
          if (device.host) {
            node.debug('Got ipaddres from device.host.');
            data.ipaddress = device.host;
          }

          // 2 different ways to obtain serialnum
          if (data.serialNum !== undefined && data.serialNum !== null) {
            if (data.serialNum.trim().toUpperCase() === serialNumber.trim().toUpperCase()) {
              node.debug('Found sonos player based on serialnumber in device description.');
              foundMatch = true;
            }
          }
          if (device.serialNumber !== undefined && device.serialNumber !== null) {
            if (device.serialNumber.trim().toUpperCase() === serialNumber.trim().toUpperCase()) {
              node.debug('Found sonos player based on serialnumber in device property.');
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
        })
        .catch({
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
        node.debug('SetTimeOut - did not find sonos player');
        callback(null, null);
      }
      if (search !== null && search !== undefined) {
        search.destroy();
        search = null;
      }
    }, 5000);
  }

  /** show error status and error message.
  * @param  {Object} node current node
  * @param  {Object} msg current msg
  * @param  {Error object} error  error object from response
  * @param  {string} functionName name of calling function
  * @param  {string} messageShort  short message for status
  */
  showError (node, msg, error, functionName, messageShort) {
    let msgShort = messageShort;
    node.debug(`Entering error handling from ${functionName}`);
    if (error.code === 'ECONNREFUSED') {
      msgShort = 'can not connect to player';
      node.error(`${functionName} - ${msgShort} Details: Verify IP address of player.`, msg);
    } else {
      // Caution: getOwn is neccessary for some error messages eg playmode!
      let errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error));
      if (errorDetails.indexOf('n-r-c-s-p:') > -1) {
        // handle my own error
        msgShort = error.message.replace('n-r-c-s-p: ', '');
        errorDetails = msgShort;
      }
      node.error(`${functionName} - ${messageShort} Details: ` + errorDetails, msg);
    }
    node.status({ fill: 'red', shape: 'dot', text: `error:${functionName} - ${msgShort}` });
  }

  /** show warning status and warn message
  * @param  {Object} node current node
  * @param  {string} functionName name of calling function
  * @param  {string} messageShort  short message for status
  * @param  {string} messageDetail  details
  */
  showWarning (node, functionName, messageShort, messageDetail) {
    node.debug(`Entering warning handling from ${functionName}`);
    node.warn(`W A R N I N G : ${functionName} - ${messageShort}. Details: ` + messageDetail);
    node.status({ fill: 'blue', shape: 'dot', text: `warning: ${functionName} - ${messageShort}` });
  }

  /** show successful completion.
  * @param  {Object} node current node
  * @param  {string} functionName name of calling function
  */
  showSuccess (node, functionName) {
    node.status({ fill: 'green', shape: 'dot', text: `ok:${functionName}` });
    node.debug(`ok:${functionName}`);
  }
};
