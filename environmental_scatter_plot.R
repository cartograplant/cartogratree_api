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

#Get column count
column_count<-ncol(csv_data)

# Put the csv_data into a vector
vectordata=as.vector(csv_data)


#Plot the PCA
jpeg(paste(args[1],'/',args[2],'_environmental_scatter_plot.jpeg', sep=""), res = 300)
# pairs(vectordata[,1:column_count], pch = 19) 
pairs.panels(
  vectordata[, 1:column_count],
  method    = "pearson",
  hist.col  = "grey80",
  density   = TRUE,
  ellipses  = TRUE,
  lm        = FALSE,
  smoother  = FALSE,
  stars     = TRUE,
  cex.cor   = 1.5,         # correlation text size
  col       = "#2C3E50",   # point color
  alpha     = 0.5,
  pch       = 19,
  gap       = 0
)
dev.off();