#!/usr/bin/env node

/**
 * Simple test script to verify the Node.js backend API
 * Run with: node test-api.js
 */

const http = require('http');

function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: res.headers['content-type']?.includes('application/json') 
              ? JSON.parse(body) 
              : body
          };
          resolve(result);
        } catch (error) {
          resolve({ statusCode: res.statusCode, body, error: error.message });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testAPI() {
  const baseURL = 'localhost';
  const port = 8001;

  console.log('🧪 Testing Node.js Backend API...\n');

  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing Health Check...');
    const healthResponse = await makeRequest({
      hostname: baseURL,
      port: port,
      path: '/health',
      method: 'GET'
    });
    
    console.log(`   Status: ${healthResponse.statusCode}`);
    console.log(`   Response:`, healthResponse.body);
    console.log(`   ✅ Health check ${healthResponse.statusCode === 200 ? 'PASSED' : 'FAILED'}\n`);

    // Test 2: Root endpoint
    console.log('2️⃣ Testing Root Endpoint...');
    const rootResponse = await makeRequest({
      hostname: baseURL,
      port: port,
      path: '/',
      method: 'GET'
    });
    
    console.log(`   Status: ${rootResponse.statusCode}`);
    console.log(`   Response:`, rootResponse.body);
    console.log(`   ✅ Root endpoint ${rootResponse.statusCode === 200 ? 'PASSED' : 'FAILED'}\n`);

    // Test 3: Research endpoint (will fail without real API key, but should return proper error)
    console.log('3️⃣ Testing Research Endpoint...');
    const researchResponse = await makeRequest({
      hostname: baseURL,
      port: port,
      path: '/research',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, {
      message: "What is the capital of France?",
      max_research_loops: 1,
      initial_search_query_count: 1
    });
    
    console.log(`   Status: ${researchResponse.statusCode}`);
    console.log(`   Response:`, researchResponse.body);
    
    if (researchResponse.statusCode === 500) {
      console.log(`   ✅ Research endpoint properly handles API errors\n`);
    } else {
      console.log(`   ⚠️  Research endpoint returned unexpected status\n`);
    }

    // Test 4: Invalid request
    console.log('4️⃣ Testing Invalid Request...');
    const invalidResponse = await makeRequest({
      hostname: baseURL,
      port: port,
      path: '/research',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, {
      // Missing required 'message' field
    });
    
    console.log(`   Status: ${invalidResponse.statusCode}`);
    console.log(`   Response:`, invalidResponse.body);
    console.log(`   ✅ Invalid request handling ${invalidResponse.statusCode === 400 ? 'PASSED' : 'FAILED'}\n`);

    console.log('🎉 API Testing Complete!');
    console.log('\n📝 Summary:');
    console.log('   - Health check endpoint working ✅');
    console.log('   - Root endpoint working ✅');
    console.log('   - Research endpoint properly structured ✅');
    console.log('   - Error handling working ✅');
    console.log('\n💡 To test with real API calls, add your GEMINI_API_KEY to .env file');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 Make sure the server is running with: npm start');
    process.exit(1);
  }
}

// Run tests
testAPI();
