#!/usr/bin/env Rscript

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 1) {
  stop("Usage: Rscript scripts/simulate-musse-tree.R <config.json>", call. = FALSE)
}

required_packages <- c("diversitree", "ape", "jsonlite")
missing_packages <- required_packages[!vapply(required_packages, requireNamespace, logical(1), quietly = TRUE)]
if (length(missing_packages) > 0) {
  stop(
    paste0(
      "Missing required R package(s): ",
      paste(missing_packages, collapse = ", "),
      ". Install them before generating realistic fixtures."
    ),
    call. = FALSE
  )
}

`%||%` <- function(value, fallback) {
  if (is.null(value)) fallback else value
}

read_number_vector <- function(value, expected_length, label) {
  numbers <- as.numeric(unlist(value, use.names = FALSE))
  if (length(numbers) != expected_length || any(!is.finite(numbers))) {
    stop(paste0(label, " must contain ", expected_length, " finite numbers."), call. = FALSE)
  }
  numbers
}

build_musse_parameters <- function(config, states) {
  state_count <- length(states)
  lambda <- read_number_vector(config$musse$birthRates, state_count, "musse.birthRates")
  mu <- read_number_vector(config$musse$extinctionRates, state_count, "musse.extinctionRates")
  transitions <- config$musse$transitionRates
  q <- c()

  for (source in states) {
    row <- transitions[[source]]
    if (is.null(row)) {
      stop(paste0("musse.transitionRates is missing source state: ", source), call. = FALSE)
    }
    for (target in states) {
      if (identical(source, target)) next
      value <- row[[target]] %||% NA
      numeric_value <- as.numeric(value)
      if (!is.finite(numeric_value) || numeric_value < 0) {
        stop(
          paste0("Invalid transition rate ", source, " -> ", target, ": ", value),
          call. = FALSE
        )
      }
      q <- c(q, numeric_value)
    }
  }

  c(lambda, mu, q)
}

safe_state_vector <- function(phy, old_tip_labels) {
  tip_state <- phy$tip.state
  if (is.null(tip_state)) {
    stop("diversitree did not return phy$tip.state.", call. = FALSE)
  }
  if (!is.null(names(tip_state)) && all(old_tip_labels %in% names(tip_state))) {
    return(as.integer(tip_state[old_tip_labels]))
  }
  as.integer(tip_state[seq_along(old_tip_labels)])
}

write_metadata <- function(phy, old_tip_labels, new_tip_labels, tip_states, config, states) {
  sampling <- config$sampling %||% list()
  start_date <- as.Date(sampling$startDate %||% "2024-01-01")
  day_spacing <- as.numeric(sampling$daySpacing %||% 1)
  if (!is.finite(day_spacing) || day_spacing < 0) {
    stop("sampling.daySpacing must be a non-negative number.", call. = FALSE)
  }

  depths <- ape::node.depth.edgelength(phy)[seq_along(new_tip_labels)]
  sample_dates <- start_date + floor((seq_along(new_tip_labels) - 1) * day_spacing + tip_states)
  metadata <- data.frame(
    "_id" = new_tip_labels,
    "seq_id" = new_tip_labels,
    "location" = states[tip_states],
    "location_state_index" = tip_states,
    "sample_date" = format(sample_dates, "%Y-%m-%d"),
    "simulation_generation" = round(depths, 8),
    check.names = FALSE
  )

  utils::write.csv(
    metadata,
    file = config$output$metadataPath,
    row.names = FALSE,
    quote = TRUE
  )
}

config_path <- args[[1]]
config <- jsonlite::read_json(config_path, simplifyVector = FALSE)
states <- unlist(config$traits$states, use.names = FALSE)
if (length(states) < 2) {
  stop("traits.states must contain at least two states.", call. = FALSE)
}

initial_state <- config$traits$initialState
initial_state_index <- match(initial_state, states)
if (is.na(initial_state_index)) {
  stop("traits.initialState must match one of traits.states.", call. = FALSE)
}

pars <- build_musse_parameters(config, states)
seed <- as.integer(config$seed)
taxa <- as.integer(config$taxa)
max_attempts <- as.integer(config$maxAttempts %||% 50)
tip_prefix <- config$output$tipPrefix %||% "PM_"
tree_scale <- as.numeric(config$alignment$treeScale %||% 1)

if (!is.finite(seed) || !is.finite(taxa) || taxa < 2 || !is.finite(max_attempts) || max_attempts < 1) {
  stop("seed, taxa, and maxAttempts must be valid positive integers.", call. = FALSE)
}
if (!is.finite(tree_scale) || tree_scale <= 0) {
  stop("alignment.treeScale must be a positive number.", call. = FALSE)
}

dir.create(dirname(config$output$newickPath), recursive = TRUE, showWarnings = FALSE)
dir.create(dirname(config$output$metadataPath), recursive = TRUE, showWarnings = FALSE)

phy <- NULL
attempt_used <- NA_integer_
last_error <- NULL

for (attempt in seq_len(max_attempts)) {
  set.seed(seed + attempt - 1L)
  candidate <- tryCatch(
    diversitree::tree.musse(
      pars,
      max.taxa = taxa,
      max.t = Inf,
      include.extinct = FALSE,
      x0 = initial_state_index
    ),
    error = function(error) {
      last_error <<- conditionMessage(error)
      NULL
    }
  )

  if (!is.null(candidate) && length(candidate$tip.label) == taxa) {
    phy <- candidate
    attempt_used <- attempt
    break
  }
}

if (is.null(phy)) {
  stop(
    paste0(
      "Failed to simulate a ", taxa, "-taxon MuSSE tree after ",
      max_attempts, " attempt(s). Last error: ", last_error %||% "none"
    ),
    call. = FALSE
  )
}

old_tip_labels <- phy$tip.label
tip_states <- safe_state_vector(phy, old_tip_labels)
new_tip_labels <- sprintf("%s%04d", tip_prefix, seq_along(old_tip_labels))

phy$tip.label <- new_tip_labels
phy$edge.length <- phy$edge.length * tree_scale

ape::write.tree(phy, file = config$output$newickPath)
write_metadata(phy, old_tip_labels, new_tip_labels, tip_states, config, states)

tree_info <- list(
  id = config$id,
  seed = seed,
  seedUsed = seed + attempt_used - 1L,
  attempt = attempt_used,
  taxa = taxa,
  treeScale = tree_scale,
  states = states,
  initialState = initial_state,
  stateDistribution = as.list(table(factor(states[tip_states], levels = states))),
  outputs = list(
    newick = config$output$newickPath,
    metadata = config$output$metadataPath
  )
)

jsonlite::write_json(tree_info, config$output$treeInfoPath, auto_unbox = TRUE, pretty = TRUE)
message("Generated MuSSE tree and metadata for ", config$id, " on attempt ", attempt_used, ".")
