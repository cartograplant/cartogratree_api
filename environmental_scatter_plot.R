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
  env,
  bg = c("lightblue", "lightgreen")[group],   # fill colors by group
  pch = 21,                                   # circle with fill
  main = "Collinearity Between Environmental Layers",
  cex.main = 2, font.main = 2,                # large, bold title
  cex.axis = 1.3, font.axis = 1,              # large, bold tick labels
  cex.lab = 1.9, font.lab = 2,                # large, bold axis labels
  cex.cor = .9, font.cor = 2,                # large, bold correlation text
  cex.labels = 1.2, font.labels = 2,          # large, bold variable names (above histograms)
  hist.col = "grey90",
  cex = 1.3                                   # enlarge points & diag text
)
dev.off();