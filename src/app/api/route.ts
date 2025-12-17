import { NextRequest, NextResponse } from 'next/server'

// Order execution service URL
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3004'

export async function POST(request: NextRequest) {
  try {
    console.log('📥 POST /api/orders - Request received')
    
    const body = await request.text()
    console.log('📊 Request body:', body)
    
    const orderData = JSON.parse(body)
    console.log('📊 Order data parsed:', orderData)
    
    // Validate required fields
    const { tokenIn, tokenOut, amountIn } = orderData
    if (!tokenIn || !tokenOut || !amountIn) {
      console.log('❌ Missing required fields')
      return NextResponse.json(
        { success: false, error: 'Missing required fields: tokenIn, tokenOut, amountIn' },
        { status: 400 }
      )
    }
    
    console.log('🔗 Forwarding to order service:', ORDER_SERVICE_URL)
    
    // Forward request to order execution service
    const response = await fetch(`${ORDER_SERVICE_URL}/api/orders/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Next.js Frontend'
      },
      body: JSON.stringify(orderData),
    })
    
    const data = await response.json()
    console.log('📊 Order service response:', data)
    
    if (!response.ok) {
      console.log('❌ Order service error:', response.status)
      return NextResponse.json(data, { status: response.status })
    }
    
    console.log('✅ Order submitted successfully')
    return NextResponse.json(data)
    
  } catch (error) {
    console.error('❌ Order execution error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error: ' + error.message },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('📥 GET /api/orders - Request received')
    
    const { searchParams } = new URL(request.url, 'http://localhost:3000')
    const orderId = searchParams.get('orderId')
    
    if (orderId) {
      console.log(`🔍 Fetching specific order: ${orderId}`)
      
      // Get specific order
      const response = await fetch(`${ORDER_SERVICE_URL}/api/orders?orderId=${orderId}`)
      const data = await response.json()
      
      console.log('📊 Order service response:', data)
      
      if (!response.ok) {
        console.log('❌ Order service error:', response.status)
        return NextResponse.json(data, { status: response.status })
      }
      
      console.log('✅ Specific order fetched successfully')
      return NextResponse.json(data)
    } else {
      console.log('🔍 Fetching all orders')
      
      // Get all orders
      const response = await fetch(`${ORDER_SERVICE_URL}/api/orders`)
      const data = await response.json()
      
      console.log('📊 Order service response:', data)
      
      if (!response.ok) {
        console.log('❌ Order service error:', response.status)
        return NextResponse.json(data, { status: response.status })
      }
      
      console.log('✅ All orders fetched successfully')
      return NextResponse.json(data)
    }
    
  } catch (error) {
    console.error('❌ Order status error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error: ' + error.message },
      { status: 500 }
    )
  }
}

// Add this for debugging
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200 })
}