import { NextRequest, NextResponse } from 'next/server'

// Order execution service URL
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3004'

export async function POST(request: NextRequest) {
  try {
    const orderData = await request.json()
    
    // Validate required fields
    const { tokenIn, tokenOut, amountIn } = orderData
    if (!tokenIn || !tokenOut || !amountIn) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: tokenIn, tokenOut, amountIn' },
        { status: 400 }
      )
    }
    
    // Forward request to order execution service
    const response = await fetch(`${ORDER_SERVICE_URL}/api/orders/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }
    
    return NextResponse.json(data)
    
  } catch (error) {
    console.error('Order execution error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId')
    
    if (orderId) {
      // Get specific order
      const response = await fetch(`${ORDER_SERVICE_URL}/api/orders/${orderId}`)
      const data = await response.json()
      
      if (!response.ok) {
        return NextResponse.json(data, { status: response.status })
      }
      
      return NextResponse.json(data)
    } else {
      // Get all orders
      const response = await fetch(`${ORDER_SERVICE_URL}/api/orders`)
      const data = await response.json()
      
      if (!response.ok) {
        return NextResponse.json(data, { status: response.status })
      }
      
      return NextResponse.json(data)
    }
    
  } catch (error) {
    console.error('Order status error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}