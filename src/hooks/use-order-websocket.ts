'use client'

import { useEffect, useState } from 'react'

interface OrderStatus {
  orderId: string
  status: 'PENDING' | 'ROUTING' | 'BUILDING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED'
  chosenDex?: 'RAYDIUM' | 'METEORA'
  executedPrice?: string
  transactionHash?: string
  errorMessage?: string
  updatedAt: string
}

interface Order {
  id: string
  status: string
  chosenDex?: string
  executedPrice?: string
  transactionHash?: string
  raydiumPrice?: string
  meteoraPrice?: string
  priceDifference?: number
  errorMessage?: string
  retryCount: number
  createdAt: string
  updatedAt: string
}

export function useOrderWebSocket(orderId?: string) {
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null)
  const [isConnected, setIsConnected] = useState(true) // Always true for HTTP polling
  const [error, setError] = useState<string | null>(null)

  return {
    orderStatus,
    isConnected,
    error,
    subscribeToOrder: (id: string) => {
      console.log(`👂 Subscribed to order: ${id}`)
    },
    unsubscribeFromOrder: (id: string) => {
      console.log(`👋 Unsubscribed from order: ${id}`)
    }
  }
}

// Hook for fetching order data via HTTP
export function useOrderData(orderId?: string) {
  const [order, setOrder] = useState<Order | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchOrder = async (id: string) => {
    setLoading(true)
    setError(null)
    
    try {
      console.log(`🔍 Fetching order: ${id}`)
      const response = await fetch(`/api/orders?orderId=${id}`)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ HTTP Error: ${response.status} - ${errorText}`)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }
      
      const data = await response.json()
      console.log(`📊 Order fetch response:`, data)
      
      if (data.success && data.order) {
        setOrder(data.order)
        console.log(`✅ Order set in state:`, data.order)
      } else {
        console.error(`❌ No order in response:`, data)
        throw new Error(data.error || 'No order data received')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      console.error(`🔥 Fetch error:`, err)
    } finally {
      setLoading(false)
    }
  }

  const fetchAllOrders = async () => {
    setLoading(true)
    setError(null)
    
    try {
      console.log(`🔍 Fetching all orders`)
      const response = await fetch('/api/orders')
      const data = await response.json()
      
      console.log(`📊 All orders response:`, data)
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch orders')
      }
      
      if (data.success && data.orders) {
        setOrders(data.orders)
        console.log(`✅ Orders set in state:`, data.orders)
      } else {
        console.error(`❌ No orders in response:`, data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      console.error(`🔥 Fetch error:`, err)
    } finally {
      setLoading(false)
    }
  }

  const submitOrder = async (orderData: {
    tokenIn: string
    tokenOut: string
    amountIn: string
    slippage?: number
    userId?: string
  }) => {
    setLoading(true)
    setError(null)
    
    try {
      console.log(`📝 Submitting order:`, orderData)
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      })
      
      const data = await response.json()
      console.log(`📊 Order submission response:`, data)
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit order')
      }
      
      // Refresh orders list
      await fetchAllOrders()
      
      // Set the new order as selected
      if (data.success && data.orderId) {
        setOrder({
          id: data.orderId,
          status: data.status,
          tokenIn: orderData.tokenIn,
          tokenOut: orderData.tokenOut,
          amountIn: orderData.amountIn,
          slippage: orderData.slippage,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        console.log(`✅ New order set as selected:`, data.orderId)
      }
      
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      console.error(`🔥 Submit error:`, err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Auto-fetch order if orderId is provided
  useEffect(() => {
    if (orderId) {
      fetchOrder(orderId)
    }
  }, [orderId])

  // Fetch all orders on mount
  useEffect(() => {
    fetchAllOrders()
  }, [])

  // Poll for order updates if we have a selected order
  useEffect(() => {
    if (order && order.status !== 'CONFIRMED' && order.status !== 'FAILED') {
      const pollInterval = setInterval(async () => {
        try {
          const response = await fetch(`/api/orders?orderId=${order.id}`)
          const data = await response.json()
          
          if (data.success && data.order) {
            const updatedOrder = data.order
            setOrder(updatedOrder)
            console.log(`🔄 Order updated: ${updatedOrder.status}`)
            
            // Stop polling when order is complete
            if (updatedOrder.status === 'CONFIRMED' || updatedOrder.status === 'FAILED') {
              clearInterval(pollInterval)
              console.log(`🏁 Polling stopped for order: ${order.id}`)
            }
          }
        } catch (err) {
          console.error(`🔥 Polling error:`, err)
        }
      }, 1000) // Poll every 1 second

      return () => {
        clearInterval(pollInterval)
      }
    }
  }, [order?.id, order?.status])

  return {
    order,
    orders,
    loading,
    error,
    fetchOrder,
    fetchAllOrders,
    submitOrder
  }
}