# install.packages(c("DBI", "RPostgres"), repos="https://cloud.r-project.org/")
# install.packages("CoordinateCleaner", repos="https://cloud.r-project.org/")
library(DBI)
library(RPostgres)
library(CoordinateCleaner)

# Receive postgreSQL connection details from command line arguments that uses flags
args <- commandArgs(trailingOnly = TRUE)
dbname <- args[which(args == "--dbname") + 1]
host <- args[which(args == "--host") + 1]
port <- as.integer(args[which(args == "--port") + 1])
user <- args[which(args == "--user") + 1]
password <- args[which(args == "--password") + 1]
# Add optional source_id argument
source_id <- NULL
if ("--source_id" %in% args) {
  source_id <- as.integer(args[which(args == "--source_id") + 1])
}

# Write a message indicating attempting to connect to the database
cat("Connecting to database...\n")
# Connect to PostgreSQL database
con <- dbConnect(RPostgres::Postgres(),
  dbname = dbname,
  host = host,
  port = port, # Default port for PostgreSQL
  user = user,
  password = password
)
cat("Connected to database.\n")

# Fetch data
cat("Fetching data from ct_trees_all_view...\n")
# Limit the column names to only those needed for cleaning (mostly to reduce memory usage)
query <- "SELECT uniquename, study_accession, family, genus, species, longitude::double precision, latitude::double precision, source_id FROM public.ct_trees_all_view WHERE latitude IS NOT NULL AND longitude IS NOT NULL"
if (!is.null(source_id)) {
  query <- paste0(query, " AND source_id = ", source_id)
}
data <- dbGetQuery(con, query)
cat("Data fetched. Number of records: ", nrow(data), "\n")

# Get clean coordinates including the uniquename column
# family column, genus column, species column, latitude column, longitude column, source_id column
# study_accession column
cleaned_data <- clean_coordinates(
  x = data,
  lon = "longitude",
  lat = "latitude",
  species = "species",
  tests = c(
    "capitals", "centroids", "equal", "gbif", "outliers", "institutions",
    "seas", "zeros"
  )
)

# Get unclean records only and add a column that contains the tests that failed per row
unclean_data <- cleaned_data[!cleaned_data$.summary, ]
# unclean_data <- cleaned_data[cleaned_data$.summary == TRUE, , drop = FALSE]


# Build failed_tests from CoordinateCleaner test columns (they start with a dot)
test_cols <- grep("^\\.", names(unclean_data), value = TRUE)
test_cols <- setdiff(test_cols, ".summary")

if (nrow(unclean_data) == 0 || length(test_cols) == 0) {
  unclean_data$failed_tests <- NA_character_
} else {
  failed_tests_list <- apply(unclean_data[, test_cols, drop = FALSE], 1, function(row) {
    # CoordinateCleaner marks failed tests as FALSE, not TRUE
    row_logical <- as.logical(row)
    idx <- which(row_logical == FALSE)
    failed <- gsub("^\\.", "", names(row)[idx])
    if (length(failed) == 0) NA_character_ else paste(failed, collapse = "; ")
  })
  unclean_data$failed_tests <- failed_tests_list
}

# unclean_data <- cleaned_data[!cleaned_data$.summary, ]



# Select relevant columns to return including failed_tests column
# unclean_data <- unclean_data[, c("uniquename", "family", "genus", "species", "latitude", "longitude", "source_id", "study_accession")] 
unclean_data <- unclean_data[, c("uniquename", "family", "genus", "species", "latitude", "longitude", "source_id", "study_accession", "failed_tests")]

# Write unclean records to a csv file
write.csv(unclean_data, "ct_trees_unclean_coordinates.csv", row.names = FALSE)
# Delete all records from coordinate_cleaner_flagged_coordinates table
dbExecute(con, "DELETE FROM public.coordinate_cleaner_flagged_coordinates")
# Insert unclean records into coordinate_cleaner_flagged_coordinates table
# Columns to insert: uniquename, latitude, longitude, failed_tests into coordinate_cleaner_flagged_coordinates table uniquename, latitude, longitude, comment
for (i in 1:nrow(unclean_data)) {
  dbExecute(con, "INSERT INTO public.coordinate_cleaner_flagged_coordinates (uniquename, latitude, longitude, comment) VALUES ($1, $2, $3, $4)",
    params = list(
      unclean_data$uniquename[i],
      unclean_data$latitude[i],
      unclean_data$longitude[i],
      unclean_data$failed_tests[i]
    )
  )
}

# Disconnect from the database
dbDisconnect(con)
# Write a message indicating completion
cat("Coordinate cleaning completed. Unclean records saved to ct_trees_unclean_coordinates.csv\n")