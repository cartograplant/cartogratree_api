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
    "capitals", "centroids", "equal", "gbif", "institutions",
    "seas", "zeros"
  )
)

# Get unclean records only
unclean_data <- cleaned_data[!cleaned_data$.summary, ]
# Select relevant columns to return
unclean_data <- unclean_data[, c("uniquename", "family", "genus", "species", "latitude", "longitude", "source_id", "study_accession")] 
# Write unclean records to a csv file
write.csv(unclean_data, "ct_trees_unclean_coordinates.csv", row.names = FALSE)
# Disconnect from the database
dbDisconnect(con)
# Write a message indicating completion
cat("Coordinate cleaning completed. Unclean records saved to ct_trees_unclean_coordinates.csv\n")