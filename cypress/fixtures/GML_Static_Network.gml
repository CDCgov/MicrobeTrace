# Static GML import fixture
graph [
  id "ContactNetwork"
  comment "Static GML import fixture"
  directed 1
  IsPlanar 1

  node [
    id 1
    label "Alpha"
    sample_type "case"
    viral_load 2.5
    status "active"
  ]
  node [
    id 2
    label "Beta"
    sample_type "contact"
    viral_load 3.75
    status "monitored"
  ]
  node [
    id 3
    label "Gamma"
    sample_type "case"
  ]

  edge [
    source 1
    target 2
    label "knows"
    type "contact"
    distance 4.5
    confirmed true
    origin "Contact.csv"
  ]
  edge [
    source 2
    target 3
    type "genetic"
    weight 7
    confirmed false
  ]
]
