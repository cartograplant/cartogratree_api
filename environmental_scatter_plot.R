args<-commandArgs(TRUE);
# directory name to store
args[1]
# analysis id is args 2
args[2]

# install.packages("psych", repos="https://cloud.r-project.org/")
library(psych)

# Load CSV data
#The CSV file t import
csv_data<-read.csv(paste(args[1],'/',args[2],'_environmental_scatter_plot.csv', sep=""))
env <- csv_data[,-1]  # Assuming the first column is an ID and should be excluded
# Clean up column names for better readability
# Replace periods with spaces and remove metadata after parentheses/double periods
colnames(env) <- gsub("\\.\\.", " (", colnames(env_data))  # Replace .. with (
colnames(env) <- gsub("\\.", " ", colnames(env_data))      # Replace remaining . with spaces
colnames(env) <- gsub("  +", " ", colnames(env_data))      # Remove multiple spaces
colnames(env) <- trimws(colnames(env_data))                # Trim leading/trailing spaces
colnames(env)

# Get column count
column_count <- ncol(env)

# Create dynamic grouping factor based on number of columns
# This creates as many groups as there are columns (or a reasonable subset)
if (column_count <= 10) {
  # For 10 or fewer columns, create that many groups
  group_levels <- LETTERS[1:column_count]
} else {
  # For more than 10 columns, cap at 10 groups for color readability
  group_levels <- LETTERS[1:10]
}

# Create grouping factor
group <- factor(sample(group_levels, nrow(env), replace=TRUE))

# Create color palette that scales with number of groups
colors <- rainbow(length(group_levels), alpha=0.6)

# Plot the pairs plot
jpeg(paste(args[1], '/', args[2], '_environmental_scatter_plot.jpeg', sep=""), res=300)
pairs.panels(
  env,
  bg = colors[group],  # Dynamically assign colors based on group
  pch = 21,
  main = "Collinearity Between Environmental Layers",
  cex.main = 2, font.main = 2,
  cex.axis = 1.3, font.axis = 1,
  cex.lab = 1.9, font.lab = 2,
  cex.cor = .9, font.cor = 2,
  cex.labels = 1.2, font.labels = 2,
  hist.col = "grey90",
  cex = 1.3
)
dev.off()

################################################
################################################
## R SESSION INFO                             ##
################################################
################################################

RLogFile <- paste(args[1],'/',args[2],'_environmental_R_sessionInfo.csv', sep="")

sink(RLogFile)
a <- sessionInfo()
print(a)
sink()

################################################
################################################
################################################
################################################
