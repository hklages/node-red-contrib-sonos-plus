// async/await syntax makes plugins such chai-as-promised obsolete 
// Passing lambdas (or arrow functions) to Mocha is discouraged therefore we do: 
// describe('xxxxx', function(){}) instead of describe('xxxxx', () => {})
// That makes the this.timeout work!

const { hhmmss2msec, encodeHtmlEntity, decodeHtmlEntity, extractSatellitesUuids, isTruthyProperty,
  isTruthyPropertyStringNotEmpty, isTruthy, isTruthyStringNotEmpty, isTruthyArray,
  isOnOff, validToInteger, validRegex }
  = require('../src/Helper.js')

const { describe, it } = require('mocha')
const { expect } = require('chai')

describe('decodeHtmlEntity function', function () {

  it('null throws error', async () => {
    const value = null
    await decodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData invalid/missing')
      })
  })

  it('undefined throws error', async () => {
    let value
    await decodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData invalid/missing')
      })
  })

  it('NaN throws error', async () => {
    const value = NaN
    await decodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData invalid/missing')
      })
  })

  it('Infinity throws error', async () => {
    const value = Infinity
    await decodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData invalid/missing')
      })
  })

  it('object throws error', async () => {
    const value = {}
    await decodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData is not string')
      })
  })

  it('number throws error', async () => {
    const value = 151
    await decodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData is not string')
      })
  })

  it('empty string allowed', async ()  => {
    const value = ''
    const result = await decodeHtmlEntity(value)
    expect(result).
      be.a('string').
      equal(value)
  })

  it('no encoding', async ()  => {
    const value = 'Hello Dolly abcdefghijklmnopqrstuvwxyz'
    const result = await decodeHtmlEntity(value)
    expect(result).
      be.a('string').
      equal(value)
  })

  it('simple encoding <>', async () => {
    const value = '&lt;Hello Dolly&gt;'
    const result = await decodeHtmlEntity(value)
    expect(result)
      .be.a('string')
      .equal('<Hello Dolly>')
  })

  it('multiple occurrences <>', async () => {
    const value = '&lt;He&lt;l&lt;lo&gt; Dol&gt;ly&gt;'
    const result = await decodeHtmlEntity(value)
    expect(result)
      .be.a('string')
      .equal('<He<l<lo> Dol>ly>')
  })

  it('all special character encoding', async () => {
    const value = '&lt;&gt;&apos;&amp;&quot;'
    const result = await decodeHtmlEntity(value)
    expect(result)
      .be.a('string')
      .equal('<>\'&"')
  })

})

describe('encodeHtmlEntity function', function () {

  it('null throws error', async () => {
    const value = null
    await encodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData invalid/missing')
      })
  })

  it('undefined throws error', async () => {
    let value
    await encodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData invalid/missing')
      })
  })

  it('NaN throws error', async () => {
    const value = NaN
    await encodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData invalid/missing')
      })
  })

  it('Infinity throws error', async () => {
    const value = Infinity
    await encodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData invalid/missing')
      })
  })

  it('object throws error', async () => {
    const value = {}
    await encodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData is not string')
      })
  })

  it('number throws error', async () => {
    const value = 151
    await encodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData is not string')
      })
  })

  it('empty string allowed', async ()  => {
    const value = ''
    const result = await encodeHtmlEntity(value)
    expect(result)
      .be.a('string')
      .equal(value)
  })

  it('no encoding', async ()  => {
    const value = 'Hello Dolly abcdefghijklmnopqrstuvwxyz'
    const result = await encodeHtmlEntity(value)
    expect(result)
      .be.a('string')
      . equal(value)
  })

  it('simple encoding <>', async () => {
    const value = '<Hello Dolly>'
    const result = await encodeHtmlEntity(value)
    expect(result)
      .be.a('string')
      .equal('&lt;Hello Dolly&gt;')
  })

  it('multiple occurrences <>', async () => {
    const value = '<He<l<lo> Dol>ly>'
    const result = await encodeHtmlEntity(value)
    expect(result)
      .be.a('string')
      .equal('&lt;He&lt;l&lt;lo&gt; Dol&gt;ly&gt;')
  })

  it('all special character encoding', async () => {
    const value = '<>\'&"'
    const result = await encodeHtmlEntity(value)
    expect(result)
      .be.a('string')
      .equal('&lt;&gt;&apos;&amp;&quot;')
  })

})

describe('extractSatellitesUuids function', function () {
  it('null throws error', async () => {
    const value = null
    await extractSatellitesUuids(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'invalid parameter - invalid/missing')
      })
  })
  it('not string throws error', async () => {
    const value = 1
    await extractSatellitesUuids(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'invalid parameter - is not string')
      })
  })
  it('no ;', async () => {
    const value = 'xxxxxx'
    await extractSatellitesUuids(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'invalid parameter - no ; ')
      })
  })
  it('1 item LR', async () => {
    const value
      = 'RINCON_949F3EC13B9901400:LF,RF;RINCON_B8E9375831C001400:LR'
    const result = await extractSatellitesUuids(value)
    expect(result)
      .be.a('array')
    expect(result[0])
      .be.a('string')
      .equal('RINCON_B8E9375831C001400')
    expect(result.length)
      .be.a('number')
      .equal(1)
  })
  it('1 item RR', async () => {
    const value
      = 'RINCON_949F3EC13B9901400:LF,RF;RINCON_38420B92ABE601400:RR'
    const result = await extractSatellitesUuids(value)
    expect(result)
      .be.a('array')
    expect(result[0])
      .be.a('string')
      .equal('RINCON_38420B92ABE601400')
    expect(result.length)
      .be.a('number')
      .equal(1)
  })
  it('1 item SW', async () => {
    const value
      = 'RINCON_949F3EC13B9901400:LF,RF;RINCON_000E58FE3AEA01400:SW'
    await extractSatellitesUuids(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'invalid parameter -  number of satellites')
      })
  })
  it('2 items', async () => {
    const value
      = 'RINCON_949F3EC13B9901400:LF,RF;RINCON_B8E9375831C001400:LR;RINCON_38420B92ABE601400:RR'
    const result = await extractSatellitesUuids(value)
    expect(result)
      .be.a('array')
    expect(result[0])
      .be.a('string')
      .equal('RINCON_B8E9375831C001400')
    expect(result[1])
      .be.a('string')
      .equal('RINCON_38420B92ABE601400')
    expect(result.length)
      .be.a('number')
      .equal(2)
  })
  it('3 items', async () => {
    const value
      // eslint-disable-next-line max-len
      = 'RINCON_48A6B8B5614E01400:LF,RF;RINCON_38420B92ABE601400:RR;RINCON_7828CA042C8401400:LR;RINCON_542A1B108A6201400:SW'
    const result = await extractSatellitesUuids(value)
    expect(result)
      .be.a('array')
    expect(result[0])
      .be.a('string')
      .equal('RINCON_38420B92ABE601400')
    expect(result[1])
      .be.a('string')
      .equal('RINCON_7828CA042C8401400')
    expect(result.length)
      .be.a('number')
      .equal(2)
  })
})

describe('hhmmss2msec function', function () {
  it('1 sec = 1000msec', ()  => {
    const value = '00:00:01'
    const result = hhmmss2msec(value)
    expect(result)
      .be.a('number')
      .equal(1000)
  })

  it('1h 1m 1s = 3661000', ()  => {
    const value = '01:01:01'
    const result = hhmmss2msec(value)
    expect(result)
      .be.a('number')
      .equal(3661000)
  })

  it('3h 4m 5s =11045000 ', ()  => {
    const value = '03:04:05'
    const result = hhmmss2msec(value)
    expect(result)
      .be.a('number')
      .equal(11045000)
  })
})

describe('isOnOff function', function () {
    
  it('on means true', () => {
    const msg = { 'payload': 'on' }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const result = isOnOff(msg, propertyName, propertyMeaning)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('ON means true', () => {
    const msg = { 'payload': 'ON' }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const result = isOnOff(msg, propertyName, propertyMeaning)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('off means false', ()  => {
    const msg = { 'payload': 'off' }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const result = isOnOff(msg, propertyName, propertyMeaning)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('OFF means false', ()  => {
    const msg = { 'payload': 'OFF' }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const result = isOnOff(msg, propertyName, propertyMeaning)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
  
})

describe('validToInteger function', function () {
  
  it('min is not number throw error', () => {
    const msg = { 'payload': 10 }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const min = '0'
    const max = 20
    const defaultValue = 10
    expect(validToInteger.bind(validToInteger,
      msg, propertyName, min, max, propertyMeaning, defaultValue))
      .to.throw('nrcsp: just a test min is not type number or less -9999')
  })

  it('min is less -9999 throw error', () => {
    const msg = { 'payload': 10 }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const min = -10000
    const max = 20
    const defaultValue = 10
    expect(validToInteger.bind(validToInteger,
      msg, propertyName, min, max, propertyMeaning, defaultValue))
      .to.throw('nrcsp: just a test min is not type number or less -9999')
  })

  it('max is not number throw error', () => {
    const msg = { 'payload': 10 }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const min = 0
    const max = '20'
    const defaultValue = 10
    expect(validToInteger.bind(validToInteger,
      msg, propertyName, min, max, propertyMeaning, defaultValue))
      .to.throw('nrcsp: just a test max is not type number or bigger 9999')
  })

  it('max is greater then  9999 throw error', () => {
    const msg = { 'payload': 10 }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const min = 0
    const max = 10000
    const defaultValue = 10
    expect(validToInteger.bind(validToInteger,
      msg, propertyName, min, max, propertyMeaning, defaultValue))
      .to.throw('nrcsp: just a test max is not type number or bigger 9999')
  })

  it('defaultValue is not number throw error', () => {
    const msg = { 'payload': 10 }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const min = 0
    const max = 20
    const defaultValue = '10'
    expect(validToInteger.bind(validToInteger,
      msg, propertyName, min, max, propertyMeaning, defaultValue))
      .to.throw('nrcsp: just a test defaultValue is not type number')
  })

  it('defaultValue is out of range throw error', () => {
    const msg = { 'payload': 10 }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const min = 0
    const max = 20
    const defaultValue = 10000
    expect(validToInteger.bind(validToInteger,
      msg, propertyName, min, max, propertyMeaning, defaultValue))
      .to.throw('just a test (msg.payload) >>10000 is out of range')
  })

  it('defaultValue is out of range throw error', () => {
    const msg = { 'payload': 10 }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const min = 0
    const max = 20
    const defaultValue = -10000
    expect(validToInteger.bind(validToInteger,
      msg, propertyName, min, max, propertyMeaning, defaultValue))
      .to.throw('nrcsp: just a test (msg.payload) >>-10000 is out of range')
  })

  it('defaultValue and payload missing', () => {
    const msg = { 'xxx': 10 }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const min = 0
    const max = 20
    expect(validToInteger.bind(validToInteger,
      msg, propertyName, min, max, propertyMeaning))
      .to.throw('nrcsp: just a test (payload) is missing/invalid')
  })

  it('payload missing using defaultValue', () => {
    const msg = { 'xxx': 10 }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const min = 0
    const max = 20
    const defaultValue = 15
    const result
      = validToInteger(msg, propertyName, min, max, propertyMeaning, defaultValue)
    expect(result)
      .be.a('number')
      .equal(15)
  })

  it('string 25 out of range 10 to 20', () => {
    const msg = { 'payload': '25' }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const min = 10
    const max = 20
    const defaultValue = 10
    expect(validToInteger.bind(validToInteger,
      msg, propertyName, min, max, propertyMeaning, defaultValue))
      .to.throw('nrcsp: just a test (msg.payload) >>25 is out of range')
  })

  it('string 5 to integer 5', () => {
    const msg = { 'payload': '5' }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const min = 0
    const max = 10
    const defaultValue = 10
    const result
      = validToInteger(msg, propertyName, min, max, propertyMeaning, defaultValue)
    expect(result)
      .be.a('number')
      .equal(5)
  })

  it('string 0 to integer 0', () => {
    const msg = { 'payload': '0' }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const min = 0
    const max = 10
    const defaultValue = 10
    const result
      = validToInteger(msg, propertyName, min, max, propertyMeaning, defaultValue)
    expect(result)
      .be.a('number')
      .equal(0)
  })

  it('string 10 to integer 10', () => {
    const msg = { 'payload': '10' }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const min = 0
    const max = 10
    const defaultValue = 10
    const result
      = validToInteger(msg, propertyName, min, max, propertyMeaning, defaultValue)
    expect(result)
      .be.a('number')
      .equal(10)
  })

  it('intger 5 to integer 5', () => {
    const msg = { 'payload': 5 }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const min = 0
    const max = 10
    const defaultValue = 10
    const result
      = validToInteger(msg, propertyName, min, max, propertyMeaning, defaultValue)
    expect(result)
      .be.a('number')
      .equal(5)
  })

  it('integer 0 to integer 0', () => {
    const msg = { 'payload': 0 }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const min = 0
    const max = 10
    const defaultValue = 10
    const result
      = validToInteger(msg, propertyName, min, max, propertyMeaning, defaultValue)
    expect(result)
      .be.a('number')
      .equal(0)
  })

  it('integer 10 to integer 10', () => {
    const msg = { 'payload': 10 }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const min = 0
    const max = 10
    const defaultValue = 10
    const result
      = validToInteger(msg, propertyName, min, max, propertyMeaning, defaultValue)
    expect(result)
      .be.a('number')
      .equal(10)
  })
  
})

describe('validRegex function', function () {
    
  it('string 01:02:03 to string 01:02:03', () => {
    const msg = { 'payload': '01:02:03' }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const regex = /^(([0-1][0-9]):([0-5][0-9]):([0-5][0-9]))$/  // REGEX_TIME
    const defaultValue = '00:00:01'
    const result
      = validRegex(msg, propertyName, regex, propertyMeaning, defaultValue)
    expect(result)
      .be.a('string')
      .equal('01:02:03')
  })

  it('string missing to string 00:00:01', () => {
    const msg = { }
    const propertyName = 'payload'
    const propertyMeaning = 'just a test'
    const regex = /^(([0-1][0-9]):([0-5][0-9]):([0-5][0-9]))$/  // REGEX_TIME
    const defaultValue = '00:00:01'
    const result
      = validRegex(msg, propertyName, regex, propertyMeaning, defaultValue)
    expect(result)
      .be.a('string')
      .equal('00:00:01')
  })

})

describe('isTruthyProperty function', function () {
  // the first 2 are coding errors and throw exceptions!
  it('0 parameter throws error', () => {
    expect(isTruthyProperty.bind(isTruthyProperty))
      .to.throw('2nd parameter is not array')
  })

  it('1 parameter throws error', () => {
    const x = {}
    expect(isTruthyProperty.bind(isTruthyProperty, x))
      .to.throw('2nd parameter is not array')
  })
  
  it('undefined obj returns false', () => {
    let obj
    const path = ['prop']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('undefined obj explicit returns false', () => {
    const obj = undefined
    const path = ['prop']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
  
  it('null obj returns false', () => {
    const obj = null
    const path = ['prop']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('NaN obj returns false', ()  => {
    const obj = NaN
    const path = ['prop']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Infinite obj returns false', ()  => {
    const obj = Infinity
    const path = ['prop']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('number obj returns false', ()  => {
    const obj = 100
    const path = ['prop']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('string obj returns false', ()  => {
    const obj = '123456789 abcdefghijklmnopqrstuvwxyz !"§$%&/()=?'
    const path = ['prop']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('empty string obj returns false', ()  => {
    const obj = ''
    const path = ['prop']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('boolean obj returns false', ()  => {
    const obj = false
    const path = ['prop']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('array obj returns false', ()  => {
    const obj = ['a', 'b']
    const path = ['prop']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('empty array obj returns false', ()  => {
    const obj = []
    const path = ['prop']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('empty object returns false', ()  => {
    const obj = {}
    const path = ['prop']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('2nd parameter empty array throws error', () => {
    const obj = { 'a': 1 } 
    const path = []
    expect(isTruthyProperty.bind(isTruthyProperty, obj, path))
      .to.throw('2nd parameter is empty array')
  })

  it('2nd parameter not array throws error', () => {
    const obj = { 'a': 1 } 
    const path = 'hallo'
    expect(isTruthyProperty.bind(isTruthyProperty, obj, path))
      .to.throw('2nd parameter is not array')
  })

  it('object returns true', ()  => {
    const obj = { 'a': 1 } 
    const path = ['a']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('property does not exist returns false', ()  => {
    const obj = { 'a': 1 } 
    const path = ['b']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('property value is null returns false', ()  => {
    const obj = { 'a': null } 
    const path = ['a']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('property value is undefined returns false', ()  => {
    const obj = { 'a': undefined } 
    const path = ['a']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('property value is NaN returns false', ()  => {
    const obj = { 'a': NaN } 
    const path = ['a']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('property value is infinite returns false', ()  => {
    const obj = { 'a': Infinity } 
    const path = ['a']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
  it('property value is empty string returns true', ()  => {
    const obj = { 'a': '' } 
    const path = ['a']
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })
})

describe('isTruthyPropertyStringNotEmpty function', function () {
  // the first 2 are coding errors and throw exceptions!
  it('0 parameter throws error', () => {
    expect(isTruthyPropertyStringNotEmpty.bind(isTruthyProperty))
      .to.throw('2nd parameter is not array')
  })

  it('1 parameter throws error', () => {
    const x = {}
    expect(isTruthyPropertyStringNotEmpty.bind(isTruthyProperty, x))
      .to.throw('2nd parameter is not array')
  })
  
  it('undefined obj returns false', () => {
    let obj
    const path = ['prop']
    const result = isTruthyPropertyStringNotEmpty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('string returns true', () => {
    const obj = { 'a': 'haallo' }
    const path = ['a']
    const result = isTruthyPropertyStringNotEmpty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })
    
  it('empty string returns false', () => {
    const obj = { 'a': '' }
    const path = ['a']
    const result = isTruthyPropertyStringNotEmpty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('boolean returns false', () => {
    const obj = { 'a': true }
    const path = ['a']
    const result = isTruthyPropertyStringNotEmpty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('number returns false', () => {
    const obj = { 'a': 10.0 }
    const path = ['a']
    const result = isTruthyPropertyStringNotEmpty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('array returns false', () => {
    const obj = { 'a': ['x'] }
    const path = ['a']
    const result = isTruthyPropertyStringNotEmpty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('obj returns false', () => {
    const obj = { 'a': {} }
    const path = ['a']
    const result = isTruthyPropertyStringNotEmpty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
})

describe('isTruthy function', function () {
  
  it('undefined returns false', () => {
    let value
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('undefined explicit returns false', () => {
    const value = undefined
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('no argument returns false', () => {
    const result = isTruthy()
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
  
  it('null returns false', () => {
    const value = null
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('NaN returns false', ()  => {
    const value = NaN
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Infinite returns false', ()  => {
    const value = Infinity
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('number returns true', ()  => {
    const value = 100
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('string returns true', ()  => {
    const value = '123456789 abcdefghijklmnopqrstuvwxyz !"§$%&/()=?'
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('empty string returns true', ()  => {
    const value = ''
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('boolean returns true', ()  => {
    const value = false
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('array returns true', ()  => {
    const value = ['a', 'b']
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('empty array returns true', ()  => {
    const value = []
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('object returns true', ()  => {
    const value = { 'a': 1, 'b': 'ok' } 
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('empty object returns true', ()  => {
    const value = {}
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

})

describe('isTruthyStringNotEmpty function', function () {
  
  it('undefined returns false', () => {
    let value
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('undefined explicit returns false', () => {
    const value = undefined
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('no argument returns false', () => {
    const result =   isTruthyStringNotEmpty()
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
  
  it('null returns false', () => {
    const value = null
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('NaN returns false', ()  => {
    const value = NaN
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Infinite returns false', ()  => {
    const value = Infinity
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('number returns false ', ()  => {
    const value = 100
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('boolean returns false', ()  => {
    const value = false
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('array returns false', ()  => {
    const value = ['a', 'b']
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('empty array returns false', ()  => {
    const value = []
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('object returns false', ()  => {
    const value = { 'a': 1, 'b': 'ok' } 
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('empty object returns false', ()  => {
    const value = {}
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('empty string returns false', ()  => {
    const value = ''
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('string returns true', ()  => {
    const value = '123456789 abcdefghijklmnopqrstuvwxyz !"§$%&/()=?'
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

})

describe('isTruthyArray function', function () {
  
  it('undefined returns false', () => {
    let value
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('undefined explicit returns false', () => {
    const value = undefined
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('no argument returns false', () => {
    const result = isTruthyArray()
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
  
  it('null returns false', () => {
    const value = null
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('NaN returns false', ()  => {
    const value = NaN
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Infinite returns false', ()  => {
    const value = Infinity
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('empty string returns false', ()  => {
    const value = ''
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('string returns false', ()  => {
    const value = '123456789 abcdefghijklmnopqrstuvwxyz !"§$%&/()=?'
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('number returns false ', ()  => {
    const value = 100
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('boolean returns false', ()  => {
    const value = false
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('object returns false', ()  => {
    const value = { 'a': 1, 'b': 'ok' } 
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('empty object returns false', ()  => {
    const value = {}
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('array returns true', ()  => {
    const value = ['a', 'b']
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('empty array returns true', ()  => {
    const value = []
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })
})

