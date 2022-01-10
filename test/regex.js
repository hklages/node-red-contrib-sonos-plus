// Passing lambdas (or arrow functions) to Mocha is discouraged therefore we do: 
// describe('xxxxx', function(){}) instead of describe('xxxxx', () => {})
// That makes the this.timeout work!

const { describe, it } = require('mocha')
const { expect } = require('chai')
const regex  = require('../src/Globals.js')

describe('REGEX_IP - invalid', function () {
  
  const tests = [
    '1',
    '1.2',
    '1.2.3',
    '1.2.3..4',
    '.',
    '12.12',
    '1234',
    '912.456.123.123',
    '1234.1234.1234',
    '123.123.123.123.123',
    '127.500.3.2',
    '256.111.111.111',
    '111.256.111.111',
    '111.111.256,111',
    '111.111.111.256',
    '-1.1.2.2',
    '1.1.1.1.',
    '1.2.3.4.',
    '.1.2.3.4',
    '....1.2.3.4',
    '1.1.1',
    '1,1,1,1',
    '000.12.234.23.23',
    '999.999.999.999'
  ]
  
  tests.forEach((item) => {
    it(`${item} invalid`, function () {
      expect(regex.REGEX_IP.test(item))
        .be.a('boolean')
        .to.be.false
    })
  })

})

describe('REGEX_IP - valid', function () {
  
  const tests = [
    '0.0.0.0',
    '1.1.1.1',
    '1.2.3.4',
    '127.0.0.0',
    '192.168.178.1',
    '192.168.178.2',
    '192.168.178.35',
    '192.168.1.1',
    '255.255.255.255',
    '203.120.223.13'
  ]
  
  tests.forEach((item) => {
    it(`${item} valid`, function () {
      expect(regex.REGEX_IP.test(item))
        .be.a('boolean')
        .to.be.true
    })
  })

})

describe('REGEX_DNS - invalid', function () {
  
  const tests = [
    '1.2.3.4',
    'mkyong.t.t.c',
    'myyong.t.c',
    'mkyong,com',
    'mkyong',
    'mkyong.123',
    '.com',
    'mkyong.com/users',
    '-mkyong.com',
    'mkyong-.com',
    'sub.-mkyong.com',
    'sub.mkyong-.com',
    '172.168.178.37',
    '172168.178.37',
  ]
  
  tests.forEach((item) => {
    it(`${item} invalid`, function () {
      expect(regex.REGEX_DNS.test(item))
        .be.a('boolean')
        .to.be.false
    })
  })

})

describe('REGEX_DNS - valid', function () {
  
  const tests = [
    'www.google.com',
    'google.com',
    'mkyong123.com',
    'mkyong-info.com',
    'sub.mkyong.com',
    'sub.mkyong-info.com',
    'mkyong.com.au',
    'g.co',
    'mkyong.t.t.co',
    'hknas.fritz.box',
    'HKNAS.FRITZ.BOX',
    'maps-to-nonascii.rfc-test.net'
  ]
  
  tests.forEach((item) => {
    it(`${item} valid`, function () {
      expect(regex.REGEX_DNS.test(item))
        .be.a('boolean')
        .to.be.true
    })
  })

})