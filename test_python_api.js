#!/usr/bin/env node

/**
 * Test script to verify the Python API integration
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execPromise = promisify(exec);

async function testPythonAPI() {
  console.log('🧪 Testing Python API Integration...\n');

  try {
    // Test 1: Check if Python bridge can read content
    console.log('1. Testing content reading...');
    const { stdout: readResult } = await execPromise('source venv/bin/activate && python3 src/iterm2_bridge.py get_content');
    const readData = JSON.parse(readResult);
    console.log(`   ✅ Read content: ${readData.success ? 'SUCCESS' : 'FAILED'}`);
    if (!readData.success) {
      console.log(`   ❌ Error: ${readData.error}`);
    }

    // Test 2: Test writing a simple command
    console.log('\n2. Testing command writing...');
    const { stdout: writeResult } = await execPromise('source venv/bin/activate && python3 src/iterm2_bridge.py write_text "echo \\"Python API test successful!\\""');
    const writeData = JSON.parse(writeResult);
    console.log(`   ✅ Write command: ${writeData.success ? 'SUCCESS' : 'FAILED'}`);
    if (!writeData.success) {
      console.log(`   ❌ Error: ${writeData.error}`);
    }

    // Test 3: Test control character sending
    console.log('\n3. Testing control character...');
    const { stdout: controlResult } = await execPromise('source venv/bin/activate && python3 src/iterm2_bridge.py send_control l');
    const controlData = JSON.parse(controlResult);
    console.log(`   ✅ Control character: ${controlData.success ? 'SUCCESS' : 'FAILED'}`);
    if (!controlData.success) {
      console.log(`   ❌ Error: ${controlData.error}`);
    }

    // Test 4: Test TTY path retrieval
    console.log('\n4. Testing TTY path retrieval...');
    const { stdout: ttyResult } = await execPromise('source venv/bin/activate && python3 src/iterm2_bridge.py get_tty');
    const ttyData = JSON.parse(ttyResult);
    console.log(`   ✅ TTY path: ${ttyData.success ? 'SUCCESS' : 'FAILED'}`);
    if (ttyData.success) {
      console.log(`   📍 TTY: ${ttyData.tty}`);
    } else {
      console.log(`   ❌ Error: ${ttyData.error}`);
    }

    console.log('\n🎉 Python API Integration Test Complete!');
    
    if (readData.success && writeData.success && controlData.success && ttyData.success) {
      console.log('✅ All tests passed! The Python API is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Check the errors above.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testPythonAPI(); 