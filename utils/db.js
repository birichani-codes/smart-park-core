const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

/**
 * Read all records from a JSON data file.
 * @param {string} collection - filename without extension (e.g. 'users')
 */
function readData(collection) {
  const filePath = path.join(DATA_DIR, `${collection}.json`);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Write records back to a JSON data file.
 * @param {string} collection
 * @param {Array}  data
 */
function writeData(collection, data) {
  const filePath = path.join(DATA_DIR, `${collection}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Find one record by a field value.
 * @param {string} collection
 * @param {string} field
 * @param {*}      value
 */
function findOne(collection, field, value) {
  const records = readData(collection);
  return records.find(r => r[field] === value) || null;
}

/**
 * Find all records matching a filter object.
 * @param {string} collection
 * @param {Object} filter  - { field: value, ... }
 */
function findAll(collection, filter = {}) {
  const records = readData(collection);
  return records.filter(r =>
    Object.entries(filter).every(([k, v]) => r[k] === v)
  );
}

/**
 * Insert a new record.
 */
function insert(collection, record) {
  const records = readData(collection);
  records.push(record);
  writeData(collection, records);
  return record;
}

/**
 * Update a record by id.
 * @param {string} collection
 * @param {string} id
 * @param {Object} updates
 */
function updateById(collection, id, updates) {
  const records = readData(collection);
  const idx = records.findIndex(r => r.id === id);
  if (idx === -1) return null;
  records[idx] = { ...records[idx], ...updates };
  writeData(collection, records);
  return records[idx];
}

/**
 * Delete a record by id.
 */
function deleteById(collection, id) {
  const records = readData(collection);
  const idx = records.findIndex(r => r.id === id);
  if (idx === -1) return false;
  records.splice(idx, 1);
  writeData(collection, records);
  return true;
}

module.exports = { readData, writeData, findOne, findAll, insert, updateById, deleteById };
