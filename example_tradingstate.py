from datamodel import Listing, OrderDepth, Trade, TradingState

timestamp = 1100

listings = {
	"EMERALDS": Listing(
		symbol="EMERALDS", 
		product="EMERALDS", 
		denomination= "XIRECS"
	),
	"TOMATOES": Listing(
		symbol="TOMATOES", 
		product="TOMATOES", 
		denomination= "XIRECS"
	),
}

order_depths = {
	"EMERALDS": OrderDepth(),
	"TOMATOES": OrderDepth(),	
}

order_depths["EMERALDS"].buy_orders={10: 7, 9: 5}
order_depths["EMERALDS"].sell_orders={12: -5, 13: -3}
order_depths["TOMATOES"].buy_orders={142: 3, 141: 5}
order_depths["TOMATOES"].sell_orders={144: -5, 145: -8}

own_trades = {
	"EMERALDS": [
		Trade(
			symbol="EMERALDS",
			price=11,
			quantity=4,
			buyer="SUBMISSION",
			seller="",
			timestamp=1000
		),
		Trade(
			symbol="EMERALDS",
			price=12,
			quantity=3,
			buyer="SUBMISSION",
			seller="",
			timestamp=1000
		)
	],
	"TOMATOES": [
		Trade(
			symbol="TOMATOES",
			price=143,
			quantity=2,
			buyer="",
			seller="SUBMISSION",
			timestamp=1000
		),
	]
}

market_trades = {
	"EMERALDS": [],
	"TOMATOES": []
}

position = {
	"EMERALDS": 10,
	"TOMATOES": -7
}

observations = {}
traderData = ""

state = TradingState(
	traderData,
	timestamp,
  listings,
	order_depths,
	own_trades,
	market_trades,
	position,
	observations
)